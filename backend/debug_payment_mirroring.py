import django
import os
import sys

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucher, PaymentVoucherItem
from vendors.models import VendorTransaction, VendorMasterBasicDetail

cnt = PaymentVoucher.objects.count()
print(f"Total Payment Vouchers: {cnt}")
if cnt > 0:
    v = PaymentVoucher.objects.order_by('-id').first()
    print(f"Latest Voucher: {v.voucher_number} (ID:{v.id}) Status: {v.voucher_type}")
    items = v.items.all()
    print(f"Items: {items.count()}")
    for item in items:
        print(f"  Item ID:{item.id} | PayTo:{item.pay_to_ledger.name if item.pay_to_ledger else 'None'} | Amt:{item.amount} | RefType:{item.reference_type}")
        
        # Check if mirrored to VendorTransaction
        vt = VendorTransaction.objects.filter(transaction_number__startswith=f"{v.voucher_number}").first()
        if vt:
            print(f"  Mirrored to VT: {vt.id} (Status:{vt.status} VendorID:{vt.vendor_id})")
        else:
            print(f"  NOT MIRRORED to VT")
            # Why not? Check VendorMaster
            vend = VendorMasterBasicDetail.objects.filter(ledger_id=item.pay_to_ledger_id).first()
            if vend:
                print(f"  Vendor Master FOUND: {vend.vendor_name} (ID:{vend.id} LedgerID:{vend.ledger_id})")
            else:
                print(f"  Vendor Master NOT FOUND for Ledger ID: {item.pay_to_ledger_id}")
