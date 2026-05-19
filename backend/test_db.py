import os
import django
import sys

# Set up Django environment
sys.path.append('d:/ledger_allacation0.3/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import JournalEntry, MasterLedger
from accounting.models_voucher_sales import VoucherSalesInvoiceDetails, VoucherSalesItems
from django.db.models import Sum

print("--- Master Ledgers ---")
for l in MasterLedger.objects.filter(name__icontains='TCS'):
    print(l.name, l.group)

from accounting.services.ledger_service import _resolve_ledger
from accounting.utils_ledger import get_standard_ledger

from accounting.models import Voucher
print("\n--- Vouchers for Reference ID 21 ---")
v21 = Voucher.objects.filter(reference_id=21, type='Sales').first()
if v21:
    print(f"Voucher ID: {v21.id}, No: {v21.voucher_number}, Total: {v21.total}")
    entries = JournalEntry.objects.filter(voucher_id=v21.id)
    print(f"Journal Entries count: {entries.count()}")
    for e in entries:
        print(e.id, e.transaction_date, e.voucher_type, e.debit, e.credit, e.ledger_name)
else:
    print("Voucher not found.")
    
print("\n--- Journal Entries for TCS ---")
tcs_entries = JournalEntry.objects.filter(ledger_name__icontains='TCS')
for e in tcs_entries:
    print(e.id, e.transaction_date, e.voucher_type, e.debit, e.credit, e.ledger_name)
