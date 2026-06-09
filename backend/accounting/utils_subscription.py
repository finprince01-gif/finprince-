from datetime import timedelta
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
# AI extraction and scanner models are imported dynamically in get_invoice_usage()

def get_billing_cycle_start(user):
    """
    Calculate the start date of the current billing cycle.
    Cycle anchor is user.subscription_start_date or user.created_at.
    Cycle length is 30 days.
    """
    today = timezone.now().date()
    # Handle both User object or just an object with subscription_start_date
    start_date = getattr(user, 'subscription_start_date', None) or (user.created_at.date() if hasattr(user, 'created_at') else today)
    
    if start_date > today:
        start_date = today

    # Calculate cycle start
    # Cycles are 30 days long.
    days_diff = (today - start_date).days
    if days_diff < 0:
        return start_date # Should not happen if start_date <= today
        
    cycles_elapsed = days_diff // 30
    cycle_start = start_date + timedelta(days=cycles_elapsed * 30)
    
    return cycle_start

def get_invoice_usage(user):
    """
    Count invoices from AI extraction and scanner for the current month.
    Dynamically sums:
      - Purchase Upload Count (InvoiceTempOCR staging records)
      - Excel Upload Count (Vouchers created from Excel upload)
      - Bank Statement Upload Count (BankStatementStagingFile staging records)
    """
    tenant_id = getattr(user, 'tenant_id', None)
    if not tenant_id:
        return 0

    from django.db.models import Q
    from ocr_pipeline.models import InvoiceTempOCR
    from bank_upload.models import BankStatementStagingFile
    from accounting.models import Voucher
    from core.models import User
    
    from django.utils.timezone import make_aware
    import datetime
    
    try:
        # Try to find a real user for the tenant to get accurate billing cycle start
        real_user = User.objects.filter(tenant_id=tenant_id).first()
        query_user = real_user if real_user else user
        cycle_start = get_billing_cycle_start(query_user)
        cycle_start_dt = make_aware(datetime.datetime.combine(cycle_start, datetime.time.min))
        
        # 1. Purchase Upload Count
        purchase_count = InvoiceTempOCR.objects.filter(
            tenant_id=tenant_id,
            created_at__gte=cycle_start_dt
        ).filter(
            Q(is_primary=True) | Q(group_id__isnull=True) | Q(group_id='')
        ).exclude(
            status__in=['FAILED', 'ERROR']
        ).exclude(
            validation_status='EXTRACTION_FAILED'
        ).count()
        
        # 2. Excel Upload Count
        excel_count = Voucher.objects.filter(
            tenant_id=tenant_id,
            type="sales",
            source="excel",
            created_at__gte=cycle_start_dt
        ).count()
        
        # 3. Bank Statement Upload Count
        bank_count = BankStatementStagingFile.objects.filter(
            tenant_id=tenant_id,
            uploaded_at__gte=cycle_start_dt
        ).exclude(
            status='deleted'
        ).count()
        
        return purchase_count + excel_count + bank_count
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error calculating dynamic AI usage: {e}", exc_info=True)
        # Fallback to legacy count if dynamic query fails
        try:
            from core.models import AIUsage
            from datetime import datetime
            now = datetime.now()
            usage = AIUsage.objects.filter(
                tenant_id=tenant_id,
                year=now.year,
                month=now.month
            ).first()
            return usage.used_count if usage else 0
        except:
            return 0

def check_subscription_limit(user, increment=1):
    """
    Enforce subscription limits.
    """
    # 1. Get Plan from user or fallback to FREE
    plan = getattr(user, 'selected_plan', 'FREE') or 'FREE'
    plan = plan.upper()
    
    LIMITS = {
        'FREE': 5,
        'STARTER': 100,
        'PRO': float('inf')
    }
    
    limit = LIMITS.get(plan, 5) # Default to Free limits
    
    if limit == float('inf'):
        return

    used = get_invoice_usage(user)
    
    # Check bounds
    if used + increment > limit:
        # User reached the limit
        raise PermissionDenied(detail={
            "error": "Invoice limit reached for your current plan.",
            "used": used,
            "limit": limit,
            "plan": plan,
            "attempted": increment,
            "message": f"You have used {used} out of {limit} invoices in your {plan} plan."
        })
