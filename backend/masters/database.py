"""
Masters Database Layer - Pure Data Access
NO business logic, NO RBAC, NO tenant validation.
Only database queries accepting tenant_id as parameter.
"""

import logging
from django.db.models import Max  # type: ignore
from accounting.models import (  # type: ignore
    MasterLedgerGroup, MasterLedger, MasterHierarchyRaw,
    AmountTransaction
)
from .models import (  # type: ignore
    MasterVoucherSales, MasterVoucherCreditNote, MasterVoucherReceipts,
    MasterVoucherPurchases, MasterVoucherDebitNote, MasterVoucherPayments,
    MasterVoucherExpenses, MasterVoucherJournal, MasterVoucherContra
)

MODEL_MAP = {
    'sales': MasterVoucherSales,
    'creditnote': MasterVoucherCreditNote,
    'receipts': MasterVoucherReceipts,
    'purchase': MasterVoucherPurchases,
    'debitnote': MasterVoucherDebitNote,
    'payments': MasterVoucherPayments,
    'expenses': MasterVoucherExpenses,
    'journal': MasterVoucherJournal,
    'contra': MasterVoucherContra,
}

# Default aliases
MasterVoucherConfig = MasterVoucherSales
VoucherConfiguration = MasterVoucherSales


logger = logging.getLogger('masters.database')


# ============================================================================
# LEDGER GROUP QUERIES
# ============================================================================

def get_all_ledger_groups(tenant_id):
    """Get all ledger groups for a tenant."""
    return MasterLedgerGroup.objects.filter(tenant_id=tenant_id)


def get_ledger_group_by_id(ledger_group_id, tenant_id):
    """Get a specific ledger group by ID."""
    return MasterLedgerGroup.objects.get(id=ledger_group_id, tenant_id=tenant_id)


def create_ledger_group(data, tenant_id):
    """Create a new ledger group."""
    return MasterLedgerGroup.objects.create(tenant_id=tenant_id, **data)


def update_ledger_group(ledger_group_id, data, tenant_id):
    """Update an existing ledger group."""
    ledger_group = get_ledger_group_by_id(ledger_group_id, tenant_id)
    for key, value in data.items():
        setattr(ledger_group, key, value)
    ledger_group.save()
    return ledger_group


def delete_ledger_group(ledger_group_id, tenant_id):
    """Delete a ledger group."""
    ledger_group = get_ledger_group_by_id(ledger_group_id, tenant_id)
    ledger_group.delete()


# ============================================================================
# LEDGER QUERIES
# ============================================================================

def get_all_ledgers(tenant_id):
    """Get all ledgers for a tenant."""
    return MasterLedger.objects.filter(tenant_id=tenant_id)


def get_ledger_by_id(ledger_id, tenant_id):
    """Get a specific ledger by ID."""
    return MasterLedger.objects.get(id=ledger_id, tenant_id=tenant_id)


def get_ledger_by_code(code, tenant_id):
    """Get a ledger by code."""
    return MasterLedger.objects.get(code=code, tenant_id=tenant_id)


def check_ledger_code_exists(code, tenant_id):
    """Check if a ledger code already exists."""
    return MasterLedger.objects.filter(code=code, tenant_id=tenant_id).exists()


def create_ledger(data, tenant_id):
    """Create a new ledger."""
    return MasterLedger.objects.create(tenant_id=tenant_id, **data)


def update_ledger(ledger_id, data, tenant_id):
    """Update an existing ledger."""
    ledger = get_ledger_by_id(ledger_id, tenant_id)
    for key, value in data.items():
        setattr(ledger, key, value)
    ledger.save()
    return ledger


def delete_ledger(ledger_id, tenant_id):
    """Delete a ledger."""
    ledger = get_ledger_by_id(ledger_id, tenant_id)
    ledger.delete()


def get_ledgers_with_code_prefix(prefix, tenant_id):
    """Get all ledgers with codes starting with a specific prefix."""
    return MasterLedger.objects.filter(
        tenant_id=tenant_id,
        code__startswith=prefix
    ).values_list('code', flat=True)


def get_max_ledger_code_in_range(pattern, tenant_id):
    """Get maximum ledger code matching a regex pattern."""
    return MasterLedger.objects.filter(
        tenant_id=tenant_id,
        code__regex=pattern
    ).aggregate(Max('code'))


# ============================================================================
# VOUCHER CONFIG QUERIES
# ============================================================================

def get_all_voucher_configs(tenant_id):
    """Get all voucher configs for a tenant."""
    return MasterVoucherConfig.objects.filter(tenant_id=tenant_id)


def get_voucher_config_by_id(config_id, tenant_id):
    """Get a specific voucher config by ID."""
    return MasterVoucherConfig.objects.get(id=config_id, tenant_id=tenant_id)


def create_voucher_config(data, tenant_id):
    """Create a new voucher config."""
    return MasterVoucherConfig.objects.create(tenant_id=tenant_id, **data)


def update_voucher_config(config_id, data, tenant_id):
    """Update an existing voucher config."""
    config = get_voucher_config_by_id(config_id, tenant_id)
    for key, value in data.items():
        setattr(config, key, value)
    config.save()
    return config


def delete_voucher_config(config_id, tenant_id):
    """Delete a voucher config."""
    config = get_voucher_config_by_id(config_id, tenant_id)
    config.delete()


# ============================================================================
# HIERARCHY QUERIES (Global - No Tenant Filtering)
# ============================================================================

def get_all_hierarchy_data():
    """Get all hierarchy data (global, no tenant filtering)."""
    return MasterHierarchyRaw.objects.all()


def get_hierarchy_by_id(hierarchy_id):
    """Get a specific hierarchy entry by ID."""
    return MasterHierarchyRaw.objects.get(id=hierarchy_id)


# ============================================================================
# VOUCHER CONFIGURATION QUERIES
# ============================================================================

def get_all_voucher_configurations(tenant_id, voucher_type='sales'):
    """Get all voucher configurations for a tenant and voucher type."""
    model = MODEL_MAP.get(voucher_type, MasterVoucherSales)
    return model.objects.filter(tenant_id=tenant_id)  # type: ignore


def get_voucher_configuration_by_id(config_id, tenant_id):
    """Get a specific voucher configuration by ID."""
    return VoucherConfiguration.objects.get(id=config_id, tenant_id=tenant_id)


def get_voucher_configurations_by_type(voucher_type, tenant_id):
    """Get all voucher configurations for a specific voucher type."""
    model = MODEL_MAP.get(voucher_type, MasterVoucherSales)
    return model.objects.filter(  # type: ignore
        tenant_id=tenant_id,
        is_active=True
    )


def create_voucher_configuration(data, tenant_id):
    """Create a new voucher configuration."""
    return VoucherConfiguration.objects.create(tenant_id=tenant_id, **data)


def update_voucher_configuration(config_id, data, tenant_id):
    """Update an existing voucher configuration."""
    config = get_voucher_configuration_by_id(config_id, tenant_id)
    for key, value in data.items():
        setattr(config, key, value)
    config.save()
    return config


def delete_voucher_configuration(config_id, tenant_id):
    """Delete a voucher configuration."""
    config = get_voucher_configuration_by_id(config_id, tenant_id)
    config.delete()


# ============================================================================
# AMOUNT TRANSACTION QUERIES
# ============================================================================

def get_all_amount_transactions(tenant_id):
    """Get all amount transactions for a tenant."""
    return AmountTransaction.objects.filter(tenant_id=tenant_id)


def get_amount_transaction_by_id(transaction_id, tenant_id):
    """Get a specific amount transaction by ID."""
    return AmountTransaction.objects.get(id=transaction_id, tenant_id=tenant_id)


def get_last_amount_transaction_for_ledger(ledger_id, tenant_id):
    """Get the last transaction for a specific ledger."""
    return AmountTransaction.objects.filter(
        tenant_id=tenant_id,
        ledger_id=ledger_id
    ).order_by('-transaction_date', '-created_at').first()


def create_amount_transaction(data, tenant_id):
    """Create a new amount transaction."""
    return AmountTransaction.objects.create(tenant_id=tenant_id, **data)


def update_amount_transaction(transaction_id, data, tenant_id):
    """Update an existing amount transaction."""
    transaction = get_amount_transaction_by_id(transaction_id, tenant_id)
    for key, value in data.items():
        setattr(transaction, key, value)
    transaction.save()
    return transaction


def delete_amount_transaction(transaction_id, tenant_id):
    """Delete an amount transaction."""
    transaction = get_amount_transaction_by_id(transaction_id, tenant_id)
    transaction.delete()

