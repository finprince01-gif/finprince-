import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from accounting.models import MasterLedgerGroup, MasterLedger
from django.db import connection, transaction

def run():
    tenant_id = '1'
    
    # 1. Create Root Groups
    print("Creating Root Groups...")
    assets_root, _ = MasterLedgerGroup.objects.get_or_create(name='Assets', tenant_id=tenant_id)
    liabilities_root, _ = MasterLedgerGroup.objects.get_or_create(name='Liabilities', tenant_id=tenant_id)

    # 2. Create Target Groups with Hierarchy and group_type
    print("Creating Hierarchical Groups...")
    
    # ASSETS
    cash_bank, _ = MasterLedgerGroup.objects.get_or_create(
        name='Cash and bank balances', parent='Assets', parent_id=assets_root, group_type='ASSET_CASH', tenant_id=tenant_id
    )
    cash_equiv, _ = MasterLedgerGroup.objects.get_or_create(
        name='Cash and cash equivalents', parent='Assets', parent_id=assets_root, group_type='ASSET_CASH', tenant_id=tenant_id
    )
    
    # LIABILITIES
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
    print("Linking Ledgers to new groups...")
    # Link by name match
    for g in MasterLedgerGroup.objects.all():
        updated = MasterLedger.objects.filter(group__iexact=g.name).update(group_id=g)
        if updated:
            print(f"  Linked {updated} ledgers to group '{g.name}'")

    # Handle 'Short-term borrowings' variation
    v_updated = MasterLedger.objects.filter(group__iexact='Short-term borrowings').update(group_id=st_borrow)
    if v_updated:
        print(f"  Linked {v_updated} ledgers from 'Short-term borrowings' variation.")

run()
