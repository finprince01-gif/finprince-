import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucherItem
from vendors.models import VendorMasterBasicDetail
from customerportal.models import CustomerMasterCustomerBasicDetails as Customer

def check_all():
    items = PaymentVoucherItem.objects.all()
    print(f"Total items: {items.count()}")
    for item in items:
        print(f"ID: {item.id} | Amount: {item.amount} | Type: {item.reference_type} | Ledger: {item.pay_to_ledger_id}")
        
if __name__ == "__main__":
    check_all()
