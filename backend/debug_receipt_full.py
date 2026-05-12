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
    r = ReceiptVoucher.objects.filter(transaction_type='RECEIPT').last()
    if r:
        ser = ReceiptVoucherSerializer(r)
        data = ser.data
        print("Receipt Voucher Properties:")
        print(f"  Header Pay To Ledger: {r.pay_to_ledger}")
        print(f"  Header Pay From Ledger: {r.pay_from_ledger}")
        
        print("\nSerialized Data Keys:")
        for k, v in data.items():
             if k != 'items': print(f"  {k}: {v}")
        
        print("\nItems (from serialzer):")
        items = data.get('items', [])
        for i in items:
            print(f"  Item: {i}")
            
    else:
        print("No ReceiptVouchers found.")
except Exception as e:
    import traceback
    traceback.print_exc()
