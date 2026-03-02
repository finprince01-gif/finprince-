"""
Reports Database Layer - Pure Data Access
NO business logic, NO RBAC, NO tenant validation.
Only database queries accepting tenant_id as parameter.
"""

import logging
from django.db.models import Sum, Q
from accounting.models import Voucher, JournalEntry
from inventory.models import InventoryStockItem, StockMovement

logger = logging.getLogger('reports.database')


# ============================================================================
# DAY BOOK QUERIES
# ============================================================================

def get_vouchers_for_daybook(tenant_id, start_date=None, end_date=None):
    """Get all vouchers for day book report."""
    vouchers = Voucher.objects.filter(tenant_id=tenant_id)
    
    if start_date:
        vouchers = vouchers.filter(date__gte=start_date)
    if end_date:
        vouchers = vouchers.filter(date__lte=end_date)
        
    return vouchers.order_by('date', 'id')


# ============================================================================
# LEDGER REPORT QUERIES
# ============================================================================

def get_vouchers_for_ledger(tenant_id, ledger_name, start_date=None, end_date=None):
    """Get all vouchers involving a specific ledger."""
    vouchers = Voucher.objects.filter(tenant_id=tenant_id)
    
    if start_date:
        vouchers = vouchers.filter(date__gte=start_date)
    if end_date:
        vouchers = vouchers.filter(date__lte=end_date)
        
    # Filter by ledger involvement
    q_party = Q(party=ledger_name)
    q_account = Q(account=ledger_name)
    q_contra = Q(from_account=ledger_name) | Q(to_account=ledger_name)
    
    # Get voucher IDs from journal entries
    journal_voucher_ids = JournalEntry.objects.filter(
        tenant_id=tenant_id,
        ledger=ledger_name
    ).values_list('voucher_id', flat=True)
    
    return vouchers.filter(
        q_party | q_account | q_contra | Q(id__in=journal_voucher_ids)
    ).distinct().order_by('date', 'id')


# ============================================================================
# TRIAL BALANCE QUERIES
# ============================================================================

def get_trial_balance_data(tenant_id):
    """Get aggregated ledger balances for trial balance."""
    entries = JournalEntry.objects.filter(tenant_id=tenant_id)
    
    return entries.values('ledger').annotate(
        total_debit=Sum('debit'),
        total_credit=Sum('credit')
    ).order_by('ledger')


# ============================================================================
# STOCK SUMMARY QUERIES
# ============================================================================

def get_stock_items(tenant_id):
    """Get all stock items for stock summary."""
    return InventoryStockItem.objects.filter(tenant_id=tenant_id)


def get_stock_movements(tenant_id, start_date=None, end_date=None):
    """Get stock movements for stock summary."""
    movements = StockMovement.objects.filter(tenant_id=tenant_id)
    
    if start_date:
        movements = movements.filter(date__gte=start_date)
    if end_date:
        movements = movements.filter(date__lte=end_date)
        
    return movements.order_by('date')
