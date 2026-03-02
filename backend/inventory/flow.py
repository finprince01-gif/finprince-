"""
Inventory Flow Layer - Business Logic + RBAC + Tenant Validation
This is the ONLY place for business decisions in the Inventory module.
Every function MUST start with tenant validation and permission checks.
"""

import logging
from core.tenant import get_user_tenant_id
from . import database as db

logger = logging.getLogger('inventory.flow')


# ============================================================================
# STOCK GROUP OPERATIONS
# ============================================================================

def list_stock_groups(user):
    """List all stock groups for the user's tenant."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - fetch data
    return db.get_all_stock_groups(tenant_id)


def create_stock_group(user, data):
    """Create a new stock group."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - create
    return db.create_stock_group(data, tenant_id)


def update_stock_group(user, stock_group_id, data):
    """Update an existing stock group."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - update
    return db.update_stock_group(stock_group_id, data, tenant_id)


def delete_stock_group(user, stock_group_id):
    """Delete a stock group."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - delete
    db.delete_stock_group(stock_group_id, tenant_id)


# ============================================================================
# UNIT OPERATIONS
# ============================================================================

def list_units(user):
    """List all units for the user's tenant."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - fetch data
    return db.get_all_units(tenant_id)


def create_unit(user, data):
    """Create a new unit."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - create
    return db.create_unit(data, tenant_id)


def update_unit(user, unit_id, data):
    """Update an existing unit."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - update
    return db.update_unit(unit_id, data, tenant_id)


def delete_unit(user, unit_id):
    """Delete a unit."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - delete
    db.delete_unit(unit_id, tenant_id)


# ============================================================================
# STOCK ITEM OPERATIONS
# ============================================================================

def list_stock_items(user):
    """List all stock items for the user's tenant."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - fetch data
    return db.get_all_stock_items(tenant_id)


def create_stock_item(user, data):
    """Create a new stock item."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - create
    return db.create_stock_item(data, tenant_id)


def bulk_create_stock_items(user, items_data):
    """Create multiple stock items at once."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - bulk create
    return db.bulk_create_stock_items(items_data, tenant_id)


def update_stock_item(user, stock_item_id, data):
    """Update an existing stock item."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - update
    return db.update_stock_item(stock_item_id, data, tenant_id)


def delete_stock_item(user, stock_item_id):
    """Delete a stock item."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - delete
    db.delete_stock_item(stock_item_id, tenant_id)


# ============================================================================
# STOCK MOVEMENT OPERATIONS
# ============================================================================

def list_stock_movements(user):
    """List all stock movements for the user's tenant."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")
    
    # 2. Business logic - fetch data
    return db.get_all_stock_movements(tenant_id)


def create_stock_movement(user, data):
    """Create a new stock movement."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - create
    return db.create_stock_movement(data, tenant_id)


def update_stock_movement(user, movement_id, data):
    """Update an existing stock movement."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - update
    return db.update_stock_movement(movement_id, data, tenant_id)


def delete_stock_movement(user, movement_id):
    """Delete a stock movement."""
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - delete
    db.delete_stock_movement(movement_id, tenant_id)
