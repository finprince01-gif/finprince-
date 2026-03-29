import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from accounting.models import MasterLedgerGroup, MasterLedger
from django.db import connection, transaction

def run():
    print("Step 1: Updating parent_id in MasterLedgerGroup...")
    groups = MasterLedgerGroup.objects.all()
    count_p = 0
    for g in groups:
        if g.parent:
            parent_obj = MasterLedgerGroup.objects.filter(name=g.parent, tenant_id=g.tenant_id).first()
            if parent_obj:
                g.parent_id = parent_obj
                g.save(update_fields=['parent_id'])
                count_p += 1
    print(f"  Linked {count_p} groups to their parents.")

    print("\nStep 2: Updating group_id in MasterLedger...")
    ledgers = MasterLedger.objects.all()
    count_l = 0
    for l in ledgers:
        if l.group:
            group_obj = MasterLedgerGroup.objects.filter(name=l.group, tenant_id=l.tenant_id).first()
            if group_obj:
                l.group_id = group_obj
                l.save(update_fields=['group_id'])
                count_l += 1
    print(f"  Linked {count_l} ledgers to their groups.")

    print("\nStep 3: Setting group_type classification...")
    assets = ['Cash and bank balances', 'Cash and cash equivalents', 'Cash-in-hand', 'Bank Accounts']
    liabilities = ['Short term borrowings', 'Short-term borrowings', 'Secured loans', 'Unsecured loans', 'Loans (Liability)']
    
    a_count = 0
    for name in assets:
        a_count += MasterLedgerGroup.objects.filter(name__iexact=name).update(group_type='ASSET_CASH')
    
    l_count = 0
    for name in liabilities:
        l_count += MasterLedgerGroup.objects.filter(name__iexact=name).update(group_type='LIABILITY_LOAN')
        
    print(f"  Flagged {a_count} Asset groups and {l_count} Liability groups.")

    print("\nStep 4: Fixing specific hierarchy for loans...")
    # Find a good parent for the loans (one that is classified as LIABILITY_LOAN)
    borrow_group = MasterLedgerGroup.objects.filter(name__icontains='borrowings', group_type='LIABILITY_LOAN').first()
    if borrow_group:
        loan_groups = ['Secured loans', 'Unsecured loans']
        for lg in loan_groups:
            MasterLedgerGroup.objects.filter(name__iexact=lg).update(parent_id=borrow_group)
            print(f"  Moved '{lg}' under '{borrow_group.name}'.")

if __name__ == "__main__":
    run()
