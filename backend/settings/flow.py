"""
Settings Flow Layer - Business Logic + Tenant Validation
This is the ONLY place for business decisions in the Settings module.
Every function MUST start with tenant validation.
"""

import logging
from core.tenant import get_user_tenant_id
from . import database as db

logger = logging.getLogger('settings.flow')


# ============================================================================
# COMPANY SETTINGS OPERATIONS
# ============================================================================

def list_company_settings(user):
    """
    List all company settings for the user's tenant.
    
    Args:
        user: Authenticated user
    
    Returns:
        QuerySet of company settings
    """
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - fetch data
    return db.get_all_company_settings(tenant_id)


def create_company_settings(user, data):
    """
    Create new company settings.
    
    Args:
        user: Authenticated user
        data: Company settings data
    
    Returns:
        Created company settings instance
    """
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - create
    return db.create_company_settings(data, tenant_id)


def update_company_settings(user, settings_id, data):
    """
    Update existing company settings.
    
    Args:
        user: Authenticated user
        settings_id: ID of settings to update
        data: Updated data
    
    Returns:
        Updated company settings instance
    """
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - update
    return db.update_company_settings(settings_id, data, tenant_id)


def delete_company_settings(user, settings_id):
    """
    Delete company settings.
    
    Args:
        user: Authenticated user
        settings_id: ID of settings to delete
    """
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - delete
    db.delete_company_settings(settings_id, tenant_id)
