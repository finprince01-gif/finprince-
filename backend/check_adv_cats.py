import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucherItem
from vendors.models import VendorMasterBasicDetail
from customerportal.models import CustomerMasterCustomerBasicDetails as Customer

def check_adv_cats():
    advs = PaymentVoucherItem.objects.filter(reference_type='ADVANCE')
    for adv in advs:
        l = adv.pay_to_ledger
        v = VendorMasterBasicDetail.objects.filter(ledger_id=l.id).first()
        if v:
            print(f"ADV {adv.id}: Vendor {v.vendor_name} | Cat: '{v.vendor_category}'")
        c = Customer.objects.filter(ledger_id=l.id).first()
        if c:
            cat = c.customer_category.category if c.customer_category else "None"
            print(f"ADV {adv.id}: Customer {c.customer_name} | Cat: '{cat}'")

if __name__ == "__main__":
    check_adv_cats()
