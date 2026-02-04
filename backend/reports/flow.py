"""
Reports Flow Layer - Business Logic + Tenant Validation
This is the ONLY place for business decisions in the Reports module.
Every function MUST start with tenant validation.
"""

import logging
from core.tenant import get_user_tenant_id
from . import database as db

logger = logging.getLogger('reports.flow')


# ============================================================================
# DAY BOOK OPERATIONS
# ============================================================================

def generate_daybook_data(user, start_date=None, end_date=None):
    """
    Generate day book report data.
    
    Args:
        user: Authenticated user
        start_date: Start date filter (optional)
        end_date: End date filter (optional)
    
    Returns:
        QuerySet of vouchers
    """
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - fetch data
    return db.get_vouchers_for_daybook(tenant_id, start_date, end_date)


# ============================================================================
# LEDGER REPORT OPERATIONS
# ============================================================================

def generate_ledger_report_data(user, ledger_name, start_date=None, end_date=None):
    """
    Generate ledger report data.
    
    Args:
        user: Authenticated user
        ledger_name: Name of the ledger
        start_date: Start date filter (optional)
        end_date: End date filter (optional)
    
    Returns:
        QuerySet of vouchers involving the ledger
    """
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - validate and fetch
    if not ledger_name:
        raise ValueError("Ledger name is required")
    
    return db.get_vouchers_for_ledger(tenant_id, ledger_name, start_date, end_date)


# ============================================================================
# TRIAL BALANCE OPERATIONS
# ============================================================================

def generate_trial_balance_data(user):
    """
    Generate trial balance report data.
    
    Args:
        user: Authenticated user
    
    Returns:
        List of ledger balances with net debit/credit
    """
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - fetch and calculate net balances
    ledger_balances = db.get_trial_balance_data(tenant_id)
    
    result = []
    for item in ledger_balances:
        debit = item['total_debit'] or 0
        credit = item['total_credit'] or 0
        
        # Calculate net balance
        net_debit = 0
        net_credit = 0
        
        if debit > credit:
            net_debit = debit - credit
        elif credit > debit:
            net_credit = credit - debit
        
        if net_debit == 0 and net_credit == 0:
            continue
            
        result.append({
            'ledger': item['ledger'],
            'debit': net_debit,
            'credit': net_credit
        })
    
    return result


# ============================================================================
# STOCK SUMMARY OPERATIONS
# ============================================================================

def generate_stock_summary_data(user, start_date=None, end_date=None):
    """
    Generate stock summary report data.
    
    Args:
        user: Authenticated user
        start_date: Start date filter (optional)
        end_date: End date filter (optional)
    
    Returns:
        Stock items and movements data
    """
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - fetch data
    stock_items = db.get_stock_items(tenant_id)
    movements = db.get_stock_movements(tenant_id, start_date, end_date)
    
    return {
        'stock_items': stock_items,
        'movements': movements
    }


# ============================================================================
# GST REPORT OPERATIONS
# ============================================================================

def generate_gst_report_data(user, start_date=None, end_date=None):
    """
    Generate GST report data.
    
    Args:
        user: Authenticated user
        start_date: Start date filter (optional)
        end_date: End date filter (optional)
    
    Returns:
        GST report data
    """
    # 1. Tenant validation
    tenant_id = get_user_tenant_id(user)
    if not tenant_id:
        raise PermissionError("User has no associated tenant")    
    # 2. Business logic - placeholder for GST calculation
    # TODO: Implement GST calculation logic
    return {
        'message': 'GST report logic to be implemented'
    }
