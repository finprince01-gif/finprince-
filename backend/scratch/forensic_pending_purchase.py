"""
FORENSIC ANALYSIS — PENDING PURCHASE DUPLICATES
Phases 1-5: Read-only database investigation.
"""
import django, os, sys, json
from collections import defaultdict
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from django.db.models import Count
from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR

SEP = "=" * 80
SEP2 = "-" * 60

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 1 — FIND DUPLICATE GROUPS
# ──────────────────────────────────────────────────────────────────────────────
print(SEP)
print("PHASE 1 — DUPLICATE GROUPS IN PENDING PURCHASE")
print(SEP)

# 1a. Group by invoice_number (same invoice_no, any vendor)
print("\n[1A] Grouped by invoice_number:")
dup_inv = (
    PendingPurchase.objects
    .values('invoice_number')
    .annotate(count=Count('id'))
    .filter(count__gt=1)
    .order_by('-count')
)
print(f"  invoice_numbers with >1 row: {dup_inv.count()}")
for row in dup_inv[:20]:
    print(f"  invoice_number='{row['invoice_number']}' count={row['count']}")

# 1b. Group by (vendor_gstin + invoice_number) — tighter match
print("\n[1B] Grouped by (vendor_gstin + invoice_number):")
dup_gstin_inv = (
    PendingPurchase.objects
    .values('vendor_gstin', 'invoice_number')
    .annotate(count=Count('id'))
    .filter(count__gt=1)
    .order_by('-count')
)
print(f"  (gstin, invoice_number) pairs with >1 row: {dup_gstin_inv.count()}")
for row in dup_gstin_inv[:20]:
    print(f"  gstin='{row['vendor_gstin']}' invoice='{row['invoice_number']}' count={row['count']}")

# 1c. Group by source_document_hash
print("\n[1C] Grouped by source_document_hash (same file):")
dup_hash = (
    PendingPurchase.objects
    .values('source_document_hash')
    .annotate(count=Count('id'))
    .filter(count__gt=1)
    .order_by('-count')
)
print(f"  file hashes with >1 row: {dup_hash.count()}")
for row in dup_hash[:10]:
    print(f"  hash='{row['source_document_hash']}' count={row['count']}")

# 1d. Total counts
total_pp = PendingPurchase.objects.count()
print(f"\n[1D] Total PendingPurchase rows: {total_pp}")
print(f"  Status breakdown:")
for s in ['PENDING', 'RESOLVED', 'REJECTED']:
    c = PendingPurchase.objects.filter(pending_purchase_status=s).count()
    print(f"    {s}: {c}")

# Collect all duplicate invoice_numbers for Phase 2
dup_invoice_numbers = [r['invoice_number'] for r in dup_gstin_inv[:5]]
dup_hashes = [r['source_document_hash'] for r in dup_hash[:5]]

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 2 — TRACE ORIGIN: for each duplicate group, join to InvoiceTempOCR
# ──────────────────────────────────────────────────────────────────────────────
print("\n" + SEP)
print("PHASE 2 — TRACE ORIGIN (join to InvoiceTempOCR)")
print(SEP)

# Get all duplicate groups with full detail
all_dup_groups = list(
    PendingPurchase.objects
    .values('vendor_gstin', 'invoice_number')
    .annotate(count=Count('id'))
    .filter(count__gt=1)
    .order_by('-count')[:10]
)

for group in all_dup_groups:
    gstin = group['vendor_gstin']
    inv_no = group['invoice_number']
    count = group['count']
    print(f"\n{SEP2}")
    print(f"DUPLICATE GROUP: gstin='{gstin}' invoice='{inv_no}' count={count}")
    print(SEP2)

    pps = list(PendingPurchase.objects.filter(
        vendor_gstin__iexact=gstin,
        invoice_number__iexact=inv_no
    ).order_by('id'))

    for pp in pps:
        print(f"\n  PendingPurchase ID: {pp.id}")
        print(f"    source_scan_row_id:    {pp.source_scan_row_id}")
        print(f"    source_document_hash:  {pp.source_document_hash}")
        print(f"    scan_session_id:       {pp.scan_session_id}")
        print(f"    invoice_number:        {pp.invoice_number}")
        print(f"    vendor_gstin:          {pp.vendor_gstin}")
        print(f"    vendor_status:         {pp.vendor_status}")
        print(f"    item_status:           {pp.item_status}")
        print(f"    voucher_status:        {pp.voucher_status}")
        print(f"    pending_purchase_status: {pp.pending_purchase_status}")
        print(f"    created_at:            {pp.created_at}")
        print(f"    updated_at:            {pp.updated_at}")

        # Join to InvoiceTempOCR
        try:
            ocr = InvoiceTempOCR.objects.get(id=pp.source_scan_row_id)
            ext = ocr.extracted_data or {}
            print(f"    [InvoiceTempOCR id={ocr.id}]")
            print(f"      file_hash:          {ocr.file_hash}")
            print(f"      upload_session_id:  {ocr.upload_session_id}")
            print(f"      created_at:         {ocr.created_at}")
            print(f"      validation_status:  {ocr.validation_status}")
            print(f"      status:             {ocr.status}")
            print(f"      processed:          {ocr.processed}")
            val_rev = ext.get('validation_revision') or {}
            print(f"      validation_revision.version: {val_rev.get('version')}")
        except InvoiceTempOCR.DoesNotExist:
            print(f"    [InvoiceTempOCR id={pp.source_scan_row_id}] NOT FOUND")

    # Determine origin type
    source_ids = [pp.source_scan_row_id for pp in pps]
    unique_source_ids = set(source_ids)
    unique_hashes = set(pp.source_document_hash for pp in pps)
    unique_sessions = set(pp.scan_session_id for pp in pps)

    print(f"\n  ORIGIN ANALYSIS:")
    print(f"    unique source_scan_row_ids: {len(unique_source_ids)} → {sorted(unique_source_ids)}")
    print(f"    unique source_document_hashes: {len(unique_hashes)}")
    print(f"    unique scan_session_ids: {len(unique_sessions)}")

    if len(unique_source_ids) == 1 and len(pps) > 1:
        print(f"    TYPE: [A] SAME upload created multiple PendingPurchase rows (same source_scan_row_id)")
    elif len(unique_hashes) == 1 and len(unique_source_ids) > 1:
        print(f"    TYPE: [B] Multiple uploads of SAME file → multiple PPs (same hash, diff staging IDs)")
    elif len(unique_hashes) > 1 and len(unique_source_ids) > 1:
        print(f"    TYPE: [B/C/D] Multiple different uploads or rescans → multiple PPs")
    else:
        print(f"    TYPE: UNKNOWN — needs more investigation")

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 3 — TRACE CREATION PATH: check if source_scan_row_id constraint is enforced
# ──────────────────────────────────────────────────────────────────────────────
print("\n" + SEP)
print("PHASE 3 — CREATION PATH ANALYSIS")
print(SEP)

# Can same source_scan_row_id appear twice?
print("\n[3A] Rows with duplicate source_scan_row_id:")
dup_source = (
    PendingPurchase.objects
    .values('source_scan_row_id')
    .annotate(count=Count('id'))
    .filter(count__gt=1)
    .order_by('-count')
)
print(f"  source_scan_row_id duplicates: {dup_source.count()}")
for r in dup_source[:5]:
    print(f"  source_scan_row_id={r['source_scan_row_id']} count={r['count']}")
    for pp in PendingPurchase.objects.filter(source_scan_row_id=r['source_scan_row_id']):
        print(f"    PP id={pp.id} status={pp.pending_purchase_status} created={pp.created_at}")

# Can same source_document_hash appear twice?
print("\n[3B] Rows with duplicate source_document_hash:")
dup_doc_hash = (
    PendingPurchase.objects
    .values('source_document_hash')
    .annotate(count=Count('id'))
    .filter(count__gt=1)
    .order_by('-count')
)
print(f"  source_document_hash duplicates: {dup_doc_hash.count()}")
for r in dup_doc_hash[:5]:
    h = r['source_document_hash']
    print(f"  hash={h[:20]}... count={r['count']}")
    for pp in PendingPurchase.objects.filter(source_document_hash=h):
        print(f"    PP id={pp.id} source_scan_row_id={pp.source_scan_row_id} invoice={pp.invoice_number} status={pp.pending_purchase_status} created={pp.created_at}")

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 4 — UNIQUENESS CONSTRAINTS
# ──────────────────────────────────────────────────────────────────────────────
print("\n" + SEP)
print("PHASE 4 — UNIQUENESS CONSTRAINT ANALYSIS")
print(SEP)

# Pull constraints from Django Meta
from django.apps import apps
PP = apps.get_model('pending_purchases', 'PendingPurchase')
meta = PP._meta

print("\n[4A] Django UniqueConstraints on PendingPurchase:")
for c in meta.constraints:
    print(f"  name='{c.name}' fields={getattr(c, 'fields', None)} condition={getattr(c, 'condition', None)}")

print("\n[4B] Django unique_together:")
print(f"  unique_together: {meta.unique_together}")

print("\n[4C] Field-level unique=True:")
for f in meta.fields:
    if f.unique:
        print(f"  field='{f.name}' unique=True")

print("\n[4D] Database-level indexes (from meta.indexes):")
for idx in meta.indexes:
    print(f"  index='{idx.name}' fields={idx.fields}")

# Check if constraints actually exist in DB
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute("""
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'pending_purchase_queue'
        ORDER BY constraint_type, constraint_name
    """)
    rows = cursor.fetchall()
    print(f"\n[4E] DB-level constraints on pending_purchase_queue:")
    for r in rows:
        print(f"  {r[1]:12} {r[0]}")

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 5 — ROOT CAUSE SUMMARY
# ──────────────────────────────────────────────────────────────────────────────
print("\n" + SEP)
print("PHASE 5 — ROOT CAUSE EVIDENCE SUMMARY")
print(SEP)

# Count exact duplicates
total_dup_pairs = dup_gstin_inv.count()
total_dup_by_hash = dup_hash.count()
total_dup_by_source_row = dup_source.count()

print(f"\n  Total PendingPurchase rows:                        {total_pp}")
print(f"  Duplicate groups by (gstin+invoice_number):        {total_dup_pairs}")
print(f"  Duplicate groups by source_document_hash:          {total_dup_by_hash}")
print(f"  Duplicate groups by source_scan_row_id:            {total_dup_by_source_row}")

# Calculate how many are 'extra' rows
extra_rows = 0
for g in PendingPurchase.objects.values('vendor_gstin', 'invoice_number').annotate(count=Count('id')).filter(count__gt=1):
    extra_rows += g['count'] - 1
print(f"  Excess/redundant PendingPurchase rows (duplicates): {extra_rows}")

print(f"\n  Constraint Analysis:")
print(f"    unique_source_scan_row (source_scan_row_id):  PRESENT in Django Meta")
print(f"    unique_source_document_hash (file hash):       PRESENT in Django Meta")
print(f"    (gstin, invoice_number, company_id) unique:   ABSENT")
print(f"    (invoice_number, company_id) unique:          ABSENT")

print(f"\n  evaluate_pending_purchase() code path:")
print(f"    1. Searches for existing PP by (invoice_number, vendor_gstin, company_id, PENDING status)")
print(f"    2. If found -> reuse and update (obj.source_scan_row_id = record.id)")
print(f"    3. If NOT found -> update_or_create by source_scan_row_id")
print(f"    PROBLEM: Each new upload creates a new InvoiceTempOCR with a new ID.")
print(f"    The existing-PP search (step 1) only looks for PENDING status rows.")
print(f"    If the previous PP was marked RESOLVED, the search misses it.")
print(f"    update_or_create by source_scan_row_id then creates a BRAND NEW PP row.")
print(f"    Result: one PP per upload, even for the same invoice.")

print("\nDone.")
