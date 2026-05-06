import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import Voucher, JournalEntry

m = []
r = []
for j in JournalEntry.objects.all():
    if not j.voucher_number or j.voucher_number == '-':
        continue
    v = Voucher.objects.filter(voucher_number=j.voucher_number).first()
    if v:
        if j.voucher_id != v.id:
            m.append((j.id, j.voucher_number, j.voucher_id, v.id))
        else:
            r.append((j.id, j.voucher_number, j.voucher_id, v.id))

print(f"Mismatches count: {len(m)}")
print(f"Matches count: {len(r)}")
if m:
    print(f"Sample mismatches (JournalEntryID, VoucherNo, JournalEntry.voucher_id, Voucher.id):")
    for item in m[:15]:
        print(item)
