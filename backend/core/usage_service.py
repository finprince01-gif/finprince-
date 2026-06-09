from datetime import datetime
from django.db.models import F # type: ignore
from .models import AIUsage, Tenant # type: ignore

def get_or_create_usage(tenant):
    """
    Get current year and month and return existing AIUsage row or create one.
    """
    now = datetime.now()
    year = now.year
    month = now.month
    
    # Handle both Tenant/Branch object or tenant_id string
    if isinstance(tenant, str):
        usage, created = AIUsage.objects.get_or_create(
            tenant_id=tenant,
            year=year,
            month=month,
            defaults={'used_count': 0}
        )
    else:
        usage, created = AIUsage.objects.get_or_create(
            tenant=tenant,
            year=year,
            month=month,
            defaults={'used_count': 0}
        )
    return usage

def check_and_increment_usage(tenant, limit):
    """
    Fetch current usage. If used_count >= limit, return False.
    Else increment atomically and return True.
    """
    from accounting.utils_subscription import get_invoice_usage
    
    # Extract tenant_id string from tenant parameter
    tenant_id = tenant if isinstance(tenant, str) else getattr(tenant, 'id', None)
    if not tenant_id:
        return False
        
    class DummyUser:
        def __init__(self, tenant_id):
            self.tenant_id = tenant_id
            self.subscription_start_date = None
            self.created_at = None

    dummy_user = DummyUser(tenant_id)
    used = get_invoice_usage(dummy_user)
    
    if limit != float('inf') and used >= limit:
        return False
        
    # Increment / sync the legacy counter row for compatibility and tracking
    try:
        usage = get_or_create_usage(tenant)
        if usage:
            AIUsage.objects.filter(pk=usage.pk).update(used_count=used + 1)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error syncing legacy AIUsage: {e}", exc_info=True)
        
    return True

