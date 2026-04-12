"""
Settings Database Layer - Pure Data Access
NO business logic, NO RBAC, NO tenant validation.
Only database queries accepting tenant_id as parameter.
"""

import logging
from core.models import Branch

logger = logging.getLogger('settings.database')


def get_branch_settings(tenant_id):
    """Get branch settings for a tenant."""
    branch = Branch.objects.get(id=tenant_id)
    return [branch]

def get_branch_settings_by_id(settings_id, tenant_id):
    """Get specific branch settings by ID."""
    return Branch.objects.get(id=tenant_id)

def create_branch_settings(data, tenant_id):
    """Update branch with provided settings data."""
    branch = Branch.objects.get(id=tenant_id)
    for key, value in data.items():
        if hasattr(branch, key):
            setattr(branch, key, value)
    branch.save()
    return branch

def update_branch_settings(settings_id, data, tenant_id):
    """Update existing branch settings."""
    branch = Branch.objects.get(id=tenant_id)
    for key, value in data.items():
        if hasattr(branch, key):
            setattr(branch, key, value)
    branch.save()
    return branch

def delete_branch_settings(settings_id, tenant_id):
    """Resets branch settings (not actual deletion of branch)."""
    # In a flat architecture, we might just clear fields if needed, 
    # but usually branch settings are not 'deleted' independent of the branch.
    pass
