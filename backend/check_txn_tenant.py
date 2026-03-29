import django
import os
import sys

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorTransaction

tx = VendorTransaction.objects.first()
if tx:
    print(f"Transaction ID: {tx.id}")
    print(f"Tenant ID: {tx.tenant_id}")
    print(f"Vendor ID: {tx.vendor_id}")
    print(f"Status: {tx.status}")
    print(f"Type: {tx.transaction_type}")
else:
    print("No transactions found in VendorTransaction.")
