import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import Voucher, JournalEntry

vouchers = Voucher.objects.all().order_by('-id')[:10]
print("--- LAST 10 VOUCHERS ---")
for v in vouchers:
    print(f"ID: {v.id} | Type: {v.type} | No: {v.voucher_number} | Date: {v.date} | Party: {v.party} | Account: {v.account} | Amount: {v.amount} | RefNo: {v.ref_no}")

print("\n--- JOURNAL ENTRIES ---")
entries = JournalEntry.objects.all().order_by('-id')[:10]
for e in entries:
    print(f"ID: {e.id} | Ledger: {e.ledger_name} | Dr: {e.debit} | Cr: {e.credit} | VoucherType: {e.voucher_type} | VoucherNo: {e.voucher_number} | VoucherID: {e.voucher_id}")
