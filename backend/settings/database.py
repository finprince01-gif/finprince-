"""
Settings Database Layer - Pure Data Access
NO business logic, NO RBAC, NO tenant validation.
Only database queries accepting tenant_id as parameter.
"""

import logging
from core.models import CompanyFullInfo

logger = logging.getLogger('settings.database')


# ============================================================================
# COMPANY SETTINGS QUERIES
# ============================================================================

def get_all_company_settings(tenant_id):
    """Get all company settings for a tenant."""
    return CompanyFullInfo.objects.filter(tenant_id=tenant_id)


def get_company_settings_by_id(settings_id, tenant_id):
    """Get specific company settings by ID."""
    return CompanyFullInfo.objects.get(id=settings_id, tenant_id=tenant_id)


def create_company_settings(data, tenant_id):
    """Create new company settings."""
    return CompanyFullInfo.objects.create(tenant_id=tenant_id, **data)


def update_company_settings(settings_id, data, tenant_id):
    """Update existing company settings."""
    settings = get_company_settings_by_id(settings_id, tenant_id)
    for key, value in data.items():
        setattr(settings, key, value)
    settings.save()
    return settings


def delete_company_settings(settings_id, tenant_id):
    """Delete company settings."""
    settings = get_company_settings_by_id(settings_id, tenant_id)
    settings.delete()
