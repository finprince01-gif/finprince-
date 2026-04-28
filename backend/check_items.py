import os
import django
import sys
from decimal import Decimal

sys.path.append('d:/ledger_report0.22/AI-accounting-0.03/backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from accounting.models import Transaction

try:
    voucher = Transaction.objects.get(id=73)
    items = list(voucher.get_items())
    print("Items found:", len(items))
    for item in items:
        print(f"Item ID: {item.id}, model: {type(item)}, amt: {item.amount}, pay_to: {item.pay_to_ledger_id}")
        
except Exception as e:
    print(e)
