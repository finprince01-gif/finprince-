import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import MasterLedger
from vendors.models import VendorMasterBasicDetail
from customerportal.models import CustomerMasterCustomerBasicDetails as Customer

def check_dharun():
    l = MasterLedger.objects.filter(name__icontains='dharun').first()
    if l:
        print(f"Ledger: {l.name}")
        v = VendorMasterBasicDetail.objects.filter(ledger=l).first()
        if v:
            print(f"  -> Vendor: {v.vendor_name} (ID: {v.id}, Cat: '{v.vendor_category}')")
        c = Customer.objects.filter(ledger=l).first()
        if c:
            cat = c.customer_category.category if c.customer_category else "None"
            print(f"  -> Customer: {c.customer_name} (ID: {c.id}, Cat: '{cat}')")
    else:
        print("Dharun NOT found.")

if __name__ == "__main__":
    check_dharun()
