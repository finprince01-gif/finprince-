import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import Transaction, Voucher
from accounting.serializers_payment import PaymentVoucherSerializer
from accounting.serializers_receipt import ReceiptVoucherSerializer

def sync_vouchers():
    payments = Transaction.objects.filter(transaction_type='PAYMENT')
    receipts = Transaction.objects.filter(transaction_type='RECEIPT')
    
    pay_ser = PaymentVoucherSerializer()
    rec_ser = ReceiptVoucherSerializer()
    
    print(f"Syncing {payments.count()} Payment Vouchers...")
    for p in payments:
        try:
            pay_ser._mirror_to_generic_voucher(p)
        except Exception as e:
            print(f"Failed Payment {p.id}: {e}")
            
    print(f"Syncing {receipts.count()} Receipt Vouchers...")
    for r in receipts:
        try:
            rec_ser._mirror_to_generic_voucher(r)
        except Exception as e:
            print(f"Failed Receipt {r.id}: {e}")
            
    print("Done mirroring vouchers!")

if __name__ == '__main__':
    sync_vouchers()
