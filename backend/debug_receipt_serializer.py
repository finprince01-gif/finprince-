import os
import django
import sys

# Setup django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounting.models import ReceiptVoucher
from accounting.serializers_receipt import ReceiptVoucherSerializer

try:
    r = ReceiptVoucher.objects.last()
    if r:
        ser = ReceiptVoucherSerializer(r)
        print("Voucher Details Keys:")
        for k, v in ser.data.items():
             print(f"  {k}: {v}")
    else:
        print("No ReceiptVouchers found.")
except Exception as e:
    import traceback
    traceback.print_exc()
