import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import MasterLedger, MasterLedgerGroup
from vendors.models import VendorMasterBasicDetail as Vendor
from customerportal.database import CustomerMasterCustomerBasicDetails as Customer

def get_or_create_group(name, tenant_id, default_parent_keyword):
    group = MasterLedgerGroup.objects.filter(name=name, tenant_id=tenant_id).first()
    if not group:
        parent = MasterLedgerGroup.objects.filter(name__icontains=default_parent_keyword, tenant_id=tenant_id).first()
        group = MasterLedgerGroup.objects.create(name=name, tenant_id=tenant_id, parent_id=parent)
        print(f"Created group '{name}' for tenant {tenant_id}")
    return group

def backfill():
    # 2. Backfill Vendors
    vendors_fixed = 0
    for v in Vendor.objects.filter(ledger_id__isnull=True):
        tenant_id = v.tenant_id
        group = get_or_create_group('Sundry Creditors', tenant_id, 'Liabilities')
        
        # Already exists a ledger with this name?
        l = MasterLedger.objects.filter(name=v.vendor_name, tenant_id=tenant_id).first()
        if not l:
            try:
                l = MasterLedger.objects.create(
                    name=v.vendor_name,
                    group=group.name,
                    group_id=group,
                    tenant_id=tenant_id,
                    category='Liability'
                )
                print(f"Created ledger '{l.name}' for vendor ID {v.id}")
            except Exception as e:
                print(f"!!! Failed to create ledger for vendor {v.vendor_name}: {e}")
                continue
        v.ledger_id = l.id
        v.save(update_fields=['ledger_id'])
        vendors_fixed += 1
        
    # 3. Backfill Customers
    customers_fixed = 0
    for c in Customer.objects.filter(ledger_id__isnull=True):
        tenant_id = c.tenant_id
        group = get_or_create_group('Sundry Debtors', tenant_id, 'Assets')
        
        # Already exists a ledger with this name?
        l = MasterLedger.objects.filter(name=c.customer_name, tenant_id=tenant_id).first()
        if not l:
            try:
                l = MasterLedger.objects.create(
                    name=c.customer_name,
                    group=group.name,
                    group_id=group,
                    tenant_id=tenant_id,
                    category='Asset'
                )
                print(f"Created ledger '{l.name}' for customer ID {c.id}")
            except Exception as e:
                print(f"!!! Failed to create ledger for customer {c.customer_name}: {e}")
                continue
        c.ledger_id = l.id
        c.save(update_fields=['ledger_id'])
        customers_fixed += 1
        
    print(f"DONE. Fixed {vendors_fixed} Vendors and {customers_fixed} Customers.")

if __name__ == '__main__':
    backfill()
