import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucherItem
from vendors.models import VendorMasterBasicDetail
from customerportal.models import CustomerMasterCustomerBasicDetails as Customer

def find_mislabeled():
    items = PaymentVoucherItem.objects.all()
    print(f"Auditing {items.count()} items for mislabeled advances...")
    
    for item in items:
        # Check if linked to vendor/customer
        v = VendorMasterBasicDetail.objects.filter(ledger=item.pay_to_ledger).first()
        c = Customer.objects.filter(ledger=item.pay_to_ledger).first()
        
        if (v or c) and item.reference_type != 'ADVANCE' and not item.reference_id:
            print(f"(!) MISLABELED: ID {item.id} | Amt {item.amount} | Type {item.reference_type} | Ledger {item.pay_to_ledger.name}")
            print(f"    Updating to ADVANCE...")
            item.reference_type = 'ADVANCE'
            item.save()
            print(f"    Fixed.")

if __name__ == "__main__":
    find_mislabeled()
