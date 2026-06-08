import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase
from django.db.models import Count

# ── 1. Staging rows that SHOULD be in queue (all unresolved statuses)
staging_unresolved = InvoiceTempOCR.objects.filter(
    validation_status__in=['NEED_VENDOR', 'NEED_ITEM', 'NEED_TO_SAVE', 'PENDING', 'PENDING_PURCHASE']
)
staging_ids = set(staging_unresolved.values_list('id', flat=True))

# ── 2. Rows ALREADY in the queue
queue_source_ids = set(PendingPurchase.objects.values_list('source_scan_row_id', flat=True))

# ── 3. Orphans — staging rows NOT in queue
orphans = staging_ids - queue_source_ids

# ── 4. Status breakdown of all staging unresolved
print(f"=== RECONCILIATION REPORT ===")
print(f"Staging unresolved rows : {len(staging_ids)}")
print(f"Queue rows (by source)  : {len(queue_source_ids)}")
print(f"Orphaned (missing)      : {len(orphans)}")
print()

# Breakdown by validation_status
print("--- Staging breakdown by validation_status ---")
for row in staging_unresolved.values('validation_status').annotate(c=Count('id')).order_by('-c'):
    print(f"  {row['validation_status']}: {row['c']}")

print()
print("--- Queue breakdown by vendor_status ---")
for row in PendingPurchase.objects.values('vendor_status').annotate(c=Count('id')).order_by('-c'):
    print(f"  {row['vendor_status']}: {row['c']}")

print()
if orphans:
    print(f"--- First 20 orphaned staging row IDs ---")
    for oid in sorted(orphans)[:20]:
        try:
            r = InvoiceTempOCR.objects.get(id=oid)
            print(f"  ID={r.id} inv={r.supplier_invoice_no} status={r.status} val_status={r.validation_status} processed={r.processed}")
        except Exception as e:
            print(f"  ID={oid} ERROR: {e}")
else:
    print("✅ All unresolved staging rows are in the queue — no orphans!")
