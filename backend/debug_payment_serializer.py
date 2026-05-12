import os
import django
import sys

# Setup django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounting.models import PaymentVoucher
from accounting.serializers_payment import PaymentVoucherSerializer

try:
    r = PaymentVoucher.objects.filter(transaction_type='PAYMENT').last()
    if r:
        ser = PaymentVoucherSerializer(r)
        print("Payment Voucher Details Keys:")
        for k, v in ser.data.items():
             print(f"  {k}: {v}")
    else:
        print("No PaymentVouchers found.")
except Exception as e:
    import traceback
    traceback.print_exc()
