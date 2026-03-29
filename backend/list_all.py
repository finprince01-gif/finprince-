import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucherItem, PaymentVoucher

def list_all():
    print("ALL PAYMENT VOUCHERS:")
    pvs = PaymentVoucher.objects.all()
    for pv in pvs:
        print(f"PV {pv.id}: Num={pv.voucher_number} | Date={pv.date} | Total={pv.total_amount}")
    
    print("\nALL PAYMENT VOUCHER ITEMS:")
    items = PaymentVoucherItem.objects.all()
    for item in items:
        print(f"PVI {item.id}: PV={item.voucher_id} | Amt={item.amount} | Type='{item.reference_type}' | Ledger={item.pay_to_ledger_id}")

if __name__ == "__main__":
    list_all()
