"""
Settings Flow Layer - Business Logic + Branch Validation
This is the ONLY place for business decisions in the Settings module.
Every function MUST start with tenant validation.
"""

import logging
from core.tenant import get_user_tenant_id
from . import database as db

logger = logging.getLogger('settings.flow')


# ============================================================================
# BRANCH SETTINGS OPERATIONS
# ============================================================================

def list_branch_settings(user):
    """
    List all branch settings for the user's tenant.
    """
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    return db.get_branch_settings(tenant_id)


def create_branch_settings(user, data):
    """
    Update branch with provided settings data.
    """
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    return db.create_branch_settings(data, tenant_id)


def update_branch_settings(user, settings_id, data):
    """
    Update existing branch settings.
    """
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    return db.update_branch_settings(settings_id, data, tenant_id)


def delete_branch_settings(user, settings_id):
    """
    Delete branch settings (placeholder).
    """
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    db.delete_branch_settings(settings_id, tenant_id)
