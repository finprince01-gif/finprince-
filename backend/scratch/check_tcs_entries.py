import os
import django
import sys
from dotenv import load_dotenv

sys.path.append(r"d:\ledger_report0.22\AI-accounting-0.03\backend")
load_dotenv(r"d:\ledger_report0.22\AI-accounting-0.03\backend\.env")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import MasterLedger, JournalEntry

tcs = MasterLedger.objects.filter(name__icontains='TCS').first()
if tcs:
    print(f'Ledger found: {tcs.name} - ID: {tcs.id}')
    entries = JournalEntry.objects.filter(ledger_id=tcs.id)
    print(f'Number of journal entries: {entries.count()}')
    for e in entries:
        print(f'Entry: voucher={e.voucher_number}, debit={e.debit}, credit={e.credit}')
else:
    print('No TCS ledger found.')
