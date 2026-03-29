import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucherItem
from vendors.models import VendorMasterBasicDetail
from customerportal.models import CustomerMasterCustomerBasicDetails as Customer

def run_diagnostic():
    print("=" * 60)
    print("DIAGNOSTIC: ADVANCE PAYMENTS LINKAGE")
    print("=" * 60)
    
    advances = PaymentVoucherItem.objects.all()
    print(f"Total PaymentVoucherItems: {advances.count()}")
    
    adv_records = advances.filter(reference_type='ADVANCE')
    print(f"Total Advance Records: {adv_records.count()}")
    
    for adv in adv_records:
        print(f"\n[Advance ID: {adv.id}]")
        print(f"  Amount: {adv.amount}")
        print(f"  Reference Type: {adv.reference_type}")
        
        ledger = adv.pay_to_ledger
        if not ledger:
            print("  (!) ERROR: pay_to_ledger is NULL")
            continue
            
        print(f"  Ledger: {ledger.name} (ID: {ledger.id})")
        
        # Vendor check
        vendor = VendorMasterBasicDetail.objects.filter(ledger_id=ledger.id).first()
        if vendor:
            print(f"  -> Linked Vendor: {vendor.vendor_name} (ID: {vendor.id})")
            print(f"     Category: {vendor.vendor_category}")
        else:
            print("  -> NOT linked to any Vendor")
            
        # Customer check
        customer = Customer.objects.filter(ledger_id=ledger.id).first()
        if customer:
            print(f"  -> Linked Customer: {customer.customer_name} (ID: {customer.id})")
            cat = customer.customer_category.category if customer.customer_category else "None"
            print(f"     Category: {cat}")
        else:
            print("  -> NOT linked to any Customer")
            
    print("\n" + "=" * 60)
    print("END OF DIAGNOSTIC")
    print("=" * 60)

if __name__ == "__main__":
    run_diagnostic()
