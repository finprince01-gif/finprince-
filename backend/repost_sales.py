import os
import django
import sys

sys.path.append('d:/ledger_allacation0.3/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import MasterLedger
from accounting.utils_ledger import get_standard_ledger

print("--- Checking Ledgers ---")
tds_ledger = MasterLedger.objects.filter(name='TDS Receivable').first()
print(f"TDS Receivable in DB: {tds_ledger is not None}")
if not tds_ledger:
    tds_ledger = get_standard_ledger('d79bd4c3-1349-400f-8b36-962f7dbf72e9', 'TDS Receivable', 'Duties & Taxes', 'Asset')
    print(f"Created TDS Receivable: {tds_ledger.id}")
