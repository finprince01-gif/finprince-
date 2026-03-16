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
    
    # Handle both Tenant object or tenant_id string
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
    import math
    usage = get_or_create_usage(tenant)
    if not usage:
        return False
        
    if limit != float('inf') and usage.used_count >= limit:
        return False
    
    # Atomic increment logic using F() expression
    # We add the limit check in the filter to prevent race conditions 
    # where multiple workers pass the initial check.
    if limit == float('inf'):
        updatedRows = AIUsage.objects.filter(pk=usage.pk).update(used_count=F("used_count") + 1)
    else:
        updatedRows = AIUsage.objects.filter(pk=usage.pk, used_count__lt=limit).update(used_count=F("used_count") + 1)
    
    return updatedRows > 0
