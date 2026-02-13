from datetime import timedelta
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from .models import Voucher, SalesVoucher as SalesInvoice
# Check if VoucherSalesInvoiceDetails exists, otherwise use SalesVoucher
try:
    from .models_voucher_sales import VoucherSalesInvoiceDetails
except ImportError:
    VoucherSalesInvoiceDetails = None

# Check if VoucherPurchaseSupplierDetails exists
try:
    from .models_voucher_purchase import VoucherPurchaseSupplierDetails
except ImportError:
    VoucherPurchaseSupplierDetails = None

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
    Count invoices (Sales + Purchase) created in the current billing cycle.
    Aggregates counts from relevant tables, excluding cancelled ones.
    """
    cycle_start = get_billing_cycle_start(user)
    tenant_id = getattr(user, 'tenant_id', None)
    
    if not tenant_id:
        return 0

    # 1. Count from Unified Voucher (types 'sales', 'purchase')
    # Use __icontains or lower for type check if needed, but normally exact.
    count_unified = Voucher.objects.filter(
        tenant_id=tenant_id,
        created_at__gte=cycle_start,
        type__in=['sales', 'purchase', 'Sales', 'Purchase']
    ).count() 
    
    # 2. Count from SalesInvoice (New Phase 1 model)
    count_sales_invoice = 0
    if SalesInvoice:
        count_sales_invoice = SalesInvoice.objects.filter(
            tenant_id=tenant_id,
            created_at__gte=cycle_start
        ).exclude(status='cancelled').count()
    
    # 3. Count from New Sales System (VoucherSalesInvoiceDetails)
    count_sales_new = 0
    if VoucherSalesInvoiceDetails:
        count_sales_new = VoucherSalesInvoiceDetails.objects.filter(
            tenant_id=tenant_id,
            created_at__gte=cycle_start
        ).count()
        # Note: VoucherSalesInvoiceDetails doesn't have status field currently.
    
    # 4. Count from New Purchase System (VoucherPurchaseSupplierDetails)
    count_purchase_new = 0
    if VoucherPurchaseSupplierDetails:
        count_purchase_new = VoucherPurchaseSupplierDetails.objects.filter(
            tenant_id=tenant_id, 
            created_at__gte=cycle_start
        ).count()
        # Note: VoucherPurchaseSupplierDetails doesn't have status field currently.
    
    # 5. Count from AI Extractions (ExtractedInvoice)
    count_extracted = 0
    try:
        from .models import ExtractedInvoice
        count_extracted = ExtractedInvoice.objects.filter(
            tenant_id=tenant_id,
            created_at__gte=cycle_start
        ).count()
    except ImportError:
        pass
    
    return count_unified + count_sales_invoice + count_sales_new + count_purchase_new + count_extracted

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
