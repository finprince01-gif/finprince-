import os
import django
import sys

sys.path.append('d:/ledger_report0.22/AI-accounting-0.03/backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from accounting.models import Transaction

try:
    t = Transaction.objects.get(id=73)
    print(f"Transaction 73:")
    print(f"  pay_from_ledger: {t.pay_from_ledger_id}")
    print(f"  pay_to_ledger: {t.pay_to_ledger_id}")
    print(f"  amount: {t.amount}")
    print(f"  total_amount: {t.total_amount}")
except Exception as e:
    print(e)
