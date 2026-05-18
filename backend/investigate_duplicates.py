"""
Investigate duplicate purchase voucher entries in reports.
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import JournalEntry, Voucher
from django.db.models import Count

print("=== Investigating Duplicate Purchase Entries ===\n")

# Check journal entries for the duplicate voucher number
voucher_no = 'seedrf000012345'

# Check all journal entries with this voucher number
entries = JournalEntry.objects.filter(
    voucher_number__icontains=voucher_no
).values('id', 'voucher_type', 'voucher_id', 'voucher_number', 'ledger_id', 'debit', 'credit', 'transaction_date').order_by('voucher_id', 'id')

print(f"Journal entries containing '{voucher_no}':")
for e in entries:
    print(f"  id={e['id']} | voucher_type={e['voucher_type']} | voucher_id={e['voucher_id']} | debit={e['debit']} | credit={e['credit']}")

print()

# Check generic Voucher table for this reference number
vouchers = Voucher.objects.filter(voucher_number__icontains=voucher_no).values(
    'id', 'type', 'voucher_number', 'date', 'total', 'reference_id'
)
print(f"Generic Voucher records for '{voucher_no}':")
for v in vouchers:
    print(f"  id={v['id']} | type={v['type']} | voucher_number={v['voucher_number']} | total={v['total']} | reference_id={v['reference_id']}")

print()

# Check for duplicate voucher_ids in journal entries (same voucher_id, many entries)
print("Journal entries grouped by voucher_id (PURCHASE type):")
by_vid = (
    JournalEntry.objects.filter(voucher_type='PURCHASE')
    .values('voucher_id', 'voucher_number')
    .annotate(cnt=Count('id'))
    .order_by('-cnt')[:20]
)
for row in by_vid:
    print(f"  voucher_id={row['voucher_id']} | voucher_number={row['voucher_number']} | entry_count={row['cnt']}")

print()

# Also look for duplicate voucher_numbers in JournalEntry (different voucher_ids, same number)
print("Duplicate voucher_numbers in journal entries (multiple voucher_ids):")
dup_nums = (
    JournalEntry.objects.filter(voucher_type='PURCHASE')
    .values('voucher_number')
    .annotate(distinct_ids=Count('voucher_id', distinct=True))
    .filter(distinct_ids__gt=1)
    .order_by('-distinct_ids')[:10]
)
for row in dup_nums:
    print(f"  voucher_number={row['voucher_number']} | distinct voucher_ids={row['distinct_ids']}")
    # Show what those voucher_ids are
    ids = JournalEntry.objects.filter(
        voucher_type='PURCHASE', voucher_number=row['voucher_number']
    ).values_list('voucher_id', flat=True).distinct()
    print(f"    voucher_ids: {list(ids)}")
