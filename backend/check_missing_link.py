import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucherItem

def check_missing_link():
    advs = PaymentVoucherItem.objects.all()
    print(f"Total PKs: {list(advs.values_list('id', flat=True))}")
    for adv in advs:
        print(f"ID: {adv.id} | Type: {adv.reference_type} | Ledger: {adv.pay_to_ledger_id}")

if __name__ == "__main__":
    check_missing_link()
