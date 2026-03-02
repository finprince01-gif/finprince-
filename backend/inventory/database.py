"""
Inventory Database Layer - Pure Data Access
NO business logic, NO RBAC, NO tenant validation.
Only database queries accepting tenant_id as parameter.
"""

import logging
from inventory.models import (
    InventoryStockGroup, InventoryUnit, InventoryStockItem, StockMovement
)

logger = logging.getLogger('inventory.database')


# ============================================================================
# STOCK GROUP QUERIES
# ============================================================================

def get_all_stock_groups(tenant_id):
    """Get all stock groups for a tenant."""
    return InventoryStockGroup.objects.filter(tenant_id=tenant_id)


def get_stock_group_by_id(stock_group_id, tenant_id):
    """Get a specific stock group by ID."""
    return InventoryStockGroup.objects.get(id=stock_group_id, tenant_id=tenant_id)


def create_stock_group(data, tenant_id):
    """Create a new stock group."""
    return InventoryStockGroup.objects.create(tenant_id=tenant_id, **data)


def update_stock_group(stock_group_id, data, tenant_id):
    """Update an existing stock group."""
    stock_group = get_stock_group_by_id(stock_group_id, tenant_id)
    for key, value in data.items():
        setattr(stock_group, key, value)
    stock_group.save()
    return stock_group


def delete_stock_group(stock_group_id, tenant_id):
    """Delete a stock group."""
    stock_group = get_stock_group_by_id(stock_group_id, tenant_id)
    stock_group.delete()


# ============================================================================
# UNIT QUERIES
# ============================================================================

def get_all_units(tenant_id):
    """Get all units for a tenant."""
    return InventoryUnit.objects.filter(tenant_id=tenant_id)


def get_unit_by_id(unit_id, tenant_id):
    """Get a specific unit by ID."""
    return InventoryUnit.objects.get(id=unit_id, tenant_id=tenant_id)


def create_unit(data, tenant_id):
    """Create a new unit."""
    return InventoryUnit.objects.create(tenant_id=tenant_id, **data)


def update_unit(unit_id, data, tenant_id):
    """Update an existing unit."""
    unit = get_unit_by_id(unit_id, tenant_id)
    for key, value in data.items():
        setattr(unit, key, value)
    unit.save()
    return unit


def delete_unit(unit_id, tenant_id):
    """Delete a unit."""
    unit = get_unit_by_id(unit_id, tenant_id)
    unit.delete()


# ============================================================================
# STOCK ITEM QUERIES
# ============================================================================

def get_all_stock_items(tenant_id):
    """Get all stock items for a tenant."""
    return InventoryStockItem.objects.filter(tenant_id=tenant_id)


def get_stock_item_by_id(stock_item_id, tenant_id):
    """Get a specific stock item by ID."""
    return InventoryStockItem.objects.get(id=stock_item_id, tenant_id=tenant_id)


def create_stock_item(data, tenant_id):
    """Create a new stock item."""
    return InventoryStockItem.objects.create(tenant_id=tenant_id, **data)


def bulk_create_stock_items(items_data, tenant_id):
    """Create multiple stock items at once."""
    stock_items = [
        InventoryStockItem(tenant_id=tenant_id, **item_data)
        for item_data in items_data
    ]
    return InventoryStockItem.objects.bulk_create(stock_items)


def update_stock_item(stock_item_id, data, tenant_id):
    """Update an existing stock item."""
    stock_item = get_stock_item_by_id(stock_item_id, tenant_id)
    for key, value in data.items():
        setattr(stock_item, key, value)
    stock_item.save()
    return stock_item


def delete_stock_item(stock_item_id, tenant_id):
    """Delete a stock item."""
    stock_item = get_stock_item_by_id(stock_item_id, tenant_id)
    stock_item.delete()


# ============================================================================
# STOCK MOVEMENT QUERIES
# ============================================================================

def get_all_stock_movements(tenant_id):
    """Get all stock movements for a tenant."""
    return StockMovement.objects.filter(tenant_id=tenant_id)


def get_stock_movement_by_id(movement_id, tenant_id):
    """Get a specific stock movement by ID."""
    return StockMovement.objects.get(id=movement_id, tenant_id=tenant_id)


def create_stock_movement(data, tenant_id):
    """Create a new stock movement."""
    return StockMovement.objects.create(tenant_id=tenant_id, **data)


def update_stock_movement(movement_id, data, tenant_id):
    """Update an existing stock movement."""
    movement = get_stock_movement_by_id(movement_id, tenant_id)
    for key, value in data.items():
        setattr(movement, key, value)
    movement.save()
    return movement


def delete_stock_movement(movement_id, tenant_id):
    """Delete a stock movement."""
    movement = get_stock_movement_by_id(movement_id, tenant_id)
    movement.delete()
