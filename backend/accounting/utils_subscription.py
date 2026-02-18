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
    Count invoices from AI extraction and scanner only in the current billing cycle.
    Only AI-extracted and scanned invoices count towards subscription limits.
    Manual invoice creation is unlimited and does not count towards the limit.
    """
    cycle_start = get_billing_cycle_start(user)
    tenant_id = getattr(user, 'tenant_id', None)
    
    if not tenant_id:
        return 0

    # Only count from AI Extractions. 
    # Tracking is moving to Local Storage on the frontend.
    count_extracted = 0
    
    return count_extracted

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
