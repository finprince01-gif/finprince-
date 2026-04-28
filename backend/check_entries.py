import os
import django
import sys

sys.path.append('d:/ledger_report0.22/AI-accounting-0.03/backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from accounting.models import JournalEntry, Transaction, Voucher

print("--- Latest Vouchers ---")
for v in Voucher.objects.all().order_by('-id')[:5]:
    print(f"ID: {v.id}, Num: {v.voucher_number}, Type: {v.type}, Date: {v.date}, Total: {v.total}")

print("\n--- Latest Transactions ---")
for t in Transaction.objects.all().order_by('-id')[:5]:
    print(f"ID: {t.id}, Num: {t.voucher_number}, Type: {t.transaction_type}, Date: {t.date}, Total: {t.total_amount}")

print("\n--- Latest Journal Entries ---")
for je in JournalEntry.objects.all().order_by('-id')[:10]:
    print(f"ID: {je.id}, V_ID: {je.voucher_id}, V_Num: {je.voucher_number}, Type: {je.voucher_type}, Ledger: {je.ledger_id} ({je.ledger_name}), Dr: {je.debit}, Cr: {je.credit}")
