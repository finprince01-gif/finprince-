
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_advance_allocation import AdvanceAllocationMap
from accounting.models_voucher_payment import PaymentVoucherItem
from accounting.models_voucher_receipt import ReceiptVoucherItem

def investigate():
    print("ALL ADVANCE ALLOCATIONS:")
    for a in AdvanceAllocationMap.objects.all():
        print(f"Alloc ID: {a.id}, Source Type: {a.advance_source_type}, Source ID: {a.advance_source_id}, Voucher ID: {a.voucher_id}, Amt: {a.amount}")

    print("\nPOSSIBLE SOURCES FOR 329.00:")
    p = PaymentVoucherItem.objects.filter(amount=329)
    for i in p:
        print(f"PMT: ID {i.id}, Ref {i.advance_ref_no}, Amt {i.amount}")
    
    r = ReceiptVoucherItem.objects.filter(amount=329)
    for i in r:
        print(f"RCT: ID {i.id}, Ref {i.advance_ref_no}, Amt {i.amount}")

if __name__ == "__main__":
    investigate()
