import os
import django
import sys
from decimal import Decimal

sys.path.append('d:/ledger_report0.22/AI-accounting-0.03/backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from accounting.models import Transaction
from accounting.serializers_payment import PaymentVoucherSerializer

try:
    voucher = Transaction.objects.get(id=73)
    serializer = PaymentVoucherSerializer()
    serializer._post_journal_entries(voucher)
    print("DONE POSTING")
except Exception as e:
    print("FAILED:", e)
