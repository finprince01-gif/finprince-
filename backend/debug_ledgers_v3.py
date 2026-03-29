import os
import django
import sys

# Set up Django environment
sys.path.append(r'c:\108\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import MasterLedger
from customerportal.models import CustomerMasterCustomerBasicDetails
from vendors.models import VendorMasterBasicDetail

print("Master Ledgers:")
for l in MasterLedger.objects.all()[:20]:
    print(f"ID: {l.id} | Name: {l.name} | Group: {l.group}")

print("\nCustomers:")
for c in CustomerMasterCustomerBasicDetails.objects.all()[:20]:
    print(f"ID: {c.id} | Name: {c.customer_name} | Ledger: {c.ledger_id}")

print("\nVendors:")
for v in VendorMasterBasicDetail.objects.all()[:20]:
    print(f"ID: {v.id} | Name: {v.vendor_name} | Ledger: {v.ledger_id}")
