import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucher, PaymentVoucherItem

def fix_unlinked_vouchers():
    pvs = PaymentVoucher.objects.all()
    print(f"Auditing {pvs.count()} vouchers for missing line items...")
    
    for pv in pvs:
        if pv.items.count() == 0 and pv.total_amount > 0:
            print(f"(!) UNLINKED VOUCHER: ID {pv.id} | Num {pv.voucher_number} | Amt {pv.total_amount}")
            # Try to link it as an ADVANCE to the 'pay_to' equivalent or similar?
            # Wait, who is the recipient of this voucher?
            # In single payment, we don't have pay_to on the voucher master, it's usually on the item?
            # Actually, let's check the fields of PaymentVoucher.
            pass

if __name__ == "__main__":
    fix_unlinked_vouchers()
