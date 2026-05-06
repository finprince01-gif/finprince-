import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import Voucher, JournalEntry

mismatches_fixed = 0
for j in JournalEntry.objects.all():
    if not j.voucher_number or j.voucher_number == '-':
        continue
    v = Voucher.objects.filter(voucher_number=j.voucher_number).first()
    if v:
        if j.voucher_id != v.id:
            old_id = j.voucher_id
            j.voucher_id = v.id
            j.save()
            print(f"Fixed: JournalEntry ID {j.id} for {j.voucher_number} (Voucher Type: {j.voucher_type}) changed voucher_id from {old_id} to {v.id}")
            mismatches_fixed += 1

print(f"\nSuccessfully fixed {mismatches_fixed} JournalEntry voucher_id mismatches!")
