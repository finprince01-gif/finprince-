import django
import os
import sys

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorTransaction, VendorMasterBasicDetail
from customerportal.database import CustomerTransaction, CustomerMasterCustomer

print("\n--- VENDOR TRANSACTIONS ---")
v_txns = VendorTransaction.objects.all().order_by('-id')[:10]
for tx in v_txns:
    v_name = VendorMasterBasicDetail.objects.filter(id=tx.vendor_id).first()
    v_name_str = v_name.vendor_name if v_name else f"ID:{tx.vendor_id}"
    print(f"ID:{tx.id} | Vendor:{v_name_str} | Type:{tx.transaction_type} | Status:{tx.status} | Num:{tx.transaction_number} | Amt:{tx.amount}")

print("\n--- CUSTOMER TRANSACTIONS ---")
c_txns = CustomerTransaction.objects.all().order_by('-id')[:10]
for tx in c_txns:
    c_name = CustomerMasterCustomer.objects.filter(id=tx.customer_id).first()
    c_name_str = c_name.customer_name if c_name else f"ID:{tx.customer_id}"
    print(f"ID:{tx.id} | Customer:{c_name_str} | Type:{tx.transaction_type} | Status:{tx.payment_status} | Num:{tx.transaction_number} | Amt:{tx.amount}")
