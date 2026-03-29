import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import MasterLedger
from vendors.models import VendorMasterBasicDetail
from customerportal.models import CustomerMasterCustomerBasicDetails as Customer

def check_ledger(lid):
    try:
        l = MasterLedger.objects.get(id=lid)
        print(f"Ledger ID {lid}: {l.name}")
        v = VendorMasterBasicDetail.objects.filter(ledger=l).first()
        if v:
            print(f"  -> Vendor: {v.vendor_name} (ID: {v.id}, Cat: '{v.vendor_category}')")
        c = Customer.objects.filter(ledger=l).first()
        if c:
            cat = c.customer_category.category if c.customer_category else "None"
            print(f"  -> Customer: {customer.customer_name} (ID: {c.id}, Cat: '{cat}')")
    except MasterLedger.DoesNotExist:
        print(f"Ledger ID {lid} DOES NOT EXIST")

if __name__ == "__main__":
    check_ledger(12)
