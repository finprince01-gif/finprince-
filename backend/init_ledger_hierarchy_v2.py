import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from accounting.models import MasterLedgerGroup, MasterLedger
from core.models import Tenant
from django.db import connection, transaction

def run_for_tenant(tenant_id):
    print(f"\n--- Initializing for Tenant: {tenant_id} ---")
    
    # 1. Create Root Groups
    assets_root, _ = MasterLedgerGroup.objects.get_or_create(name='Assets', tenant_id=tenant_id)
    liabilities_root, _ = MasterLedgerGroup.objects.get_or_create(name='Liabilities', tenant_id=tenant_id)

    # 2. Create Target Groups with Hierarchy and group_type
    cash_bank, _ = MasterLedgerGroup.objects.get_or_create(
        name='Cash and bank balances', parent='Assets', parent_id=assets_root, group_type='ASSET_CASH', tenant_id=tenant_id
    )
    cash_equiv, _ = MasterLedgerGroup.objects.get_or_create(
        name='Cash and cash equivalents', parent='Assets', parent_id=assets_root, group_type='ASSET_CASH', tenant_id=tenant_id
    )
    st_borrow, _ = MasterLedgerGroup.objects.get_or_create(
        name='Short term borrowings', parent='Liabilities', parent_id=liabilities_root, group_type='LIABILITY_LOAN', tenant_id=tenant_id
    )
    sec_loan, _ = MasterLedgerGroup.objects.get_or_create(
        name='Secured loans', parent='Short term borrowings', parent_id=st_borrow, group_type='LIABILITY_LOAN', tenant_id=tenant_id
    )
    unsec_loan, _ = MasterLedgerGroup.objects.get_or_create(
        name='Unsecured loans', parent='Short term borrowings', parent_id=st_borrow, group_type='LIABILITY_LOAN', tenant_id=tenant_id
    )

    # 3. Link Ledgers
    # Match by 'group' name
    for g in MasterLedgerGroup.objects.filter(tenant_id=tenant_id):
        updated = MasterLedger.objects.filter(tenant_id=tenant_id, group__iexact=g.name).update(group_id=g)
        if updated:
            print(f"  Linked {updated} ledgers to group '{g.name}'")

    # Match by 'sub_group_1' - handle variation like "Unsecured Loans (Short term)"
    unsec_updated = MasterLedger.objects.filter(
        tenant_id=tenant_id, 
        sub_group_1__icontains='Unsecured Loans'
    ).update(group_id=unsec_loan)
    if unsec_updated:
        print(f"  Linked {unsec_updated} ledgers to 'Unsecured loans' via sub_group_1.")

    sec_updated = MasterLedger.objects.filter(
        tenant_id=tenant_id, 
        sub_group_1__icontains='Secured Loans'
    ).update(group_id=sec_loan)
    if sec_updated:
        print(f"  Linked {sec_updated} ledgers to 'Secured loans' via sub_group_1.")

    # Match variation for Short term borrowings
    v_updated = MasterLedger.objects.filter(tenant_id=tenant_id, group__iexact='Short-term borrowings').update(group_id=st_borrow)
    if v_updated:
        print(f"  Linked {v_updated} ledgers from 'Short-term borrowings' variation.")

def run():
    tenants = Tenant.objects.all()
    for t in tenants:
        run_for_tenant(t.id)

if __name__ == "__main__":
    run()
