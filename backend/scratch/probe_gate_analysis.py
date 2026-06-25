"""
DEFINITIVE PROBE: Use a record that has gst_audit_trail in staging
but the user sees NOT CHECKED in Purchase Scan UI (SmartInvoiceUploadModal).

SmartInvoiceUploadModal reads: row.extracted_data  (InvoiceTempOCR.extracted_data)
PendingPurchases reads:        purchase.extraction_payload (PendingPurchase.extraction_payload)

The upload scan review shows ALREADY EXIST for vendor/item/voucher.
That means we need to look at InvoiceTempOCR records, not PendingPurchase.
"""
import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.models import InvoiceTempOCR

SEP = "=" * 70

# Find staging records where:
# - status is ALREADY EXIST equivalent (DUPLICATE, PENDING_PURCHASE, COMPLETED)
# - gst_audit_trail is ABSENT from extracted_data
print(SEP)
print("SEARCHING: InvoiceTempOCR records WITHOUT gst_audit_trail")
print("These are the rows that show NOT CHECKED in the Upload Scan Review")
print(SEP)

missing_audit = []
has_audit = []

for rec in InvoiceTempOCR.objects.filter(is_primary=True).order_by('-id')[:200]:
    ext = rec.extracted_data or {}
    audit = ext.get('gst_audit_trail')
    if audit:
        has_audit.append(rec)
    else:
        missing_audit.append(rec)

print(f"Total scanned (is_primary=True, last 200): {len(missing_audit) + len(has_audit)}")
print(f"  With gst_audit_trail    : {len(has_audit)}")
print(f"  WITHOUT gst_audit_trail : {len(missing_audit)}")

print()
print("Sample records WITHOUT gst_audit_trail:")
print("-" * 70)
for rec in missing_audit[:5]:
    ext = rec.extracted_data or {}
    print(f"InvoiceTempOCR id={rec.id}")
    print(f"  validation_status : {rec.validation_status}")
    print(f"  status            : {rec.status}")
    print(f"  processed         : {rec.processed}")
    print(f"  is_canonical_frozen : {ext.get('is_canonical_frozen')}")
    val_rev = ext.get('validation_revision')
    print(f"  validation_revision : {val_rev}")
    
    # Determine WHY gst_audit_trail is absent
    # Gate 1: is_already_finalized check (pipeline.py L2194-2203)
    gate1 = (
        rec.status in ['VOUCHER_CREATED', 'COMPLETED', 'DUPLICATE', 'FAILED', 'ERROR']
        or (rec.status == 'FINALIZED' and rec.processed is True)
        or rec.processed is True
        or rec.validation_status in ['VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']
    )
    # Gate 2: is_canonical_frozen bypass (pipeline.py L2210-2212)
    gate2 = (
        ext.get('is_canonical_frozen') is True
        and rec.processed is True
        and rec.validation_status and rec.validation_status != 'PENDING'
    )
    # Gate 3: validation_revision hash skip (pipeline.py L2216-2218)
    from ocr_pipeline.integrity_enforcer import get_dto_hash
    current_hash = get_dto_hash(ext)
    val_rev_dict = ext.get('validation_revision') if isinstance(ext.get('validation_revision'), dict) else None
    stored_hash = val_rev_dict.get('hash') if val_rev_dict else None
    gate3 = (
        stored_hash and stored_hash == current_hash
        and rec.processed is True
        and rec.validation_status and rec.validation_status != 'PENDING'
    )
    print(f"  GATE1 (is_already_finalized)     : {gate1}")
    print(f"  GATE2 (is_canonical_frozen)      : {gate2}")
    print(f"  GATE3 (hash_skip)                : {gate3}")
    if gate1:
        blocked_by = []
        if rec.status in ['VOUCHER_CREATED', 'COMPLETED', 'DUPLICATE', 'FAILED', 'ERROR']:
            blocked_by.append(f"status='{rec.status}'")
        if rec.status == 'FINALIZED' and rec.processed is True:
            blocked_by.append("status=FINALIZED+processed=True")
        if rec.processed is True:
            blocked_by.append("processed=True")
        if rec.validation_status in ['VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']:
            blocked_by.append(f"validation_status='{rec.validation_status}'")
        print(f"  BLOCKED BY: {', '.join(blocked_by)}")
    print()

# Summary by gate
print(SEP)
print("GATE ANALYSIS ACROSS ALL 200 RECORDS WITHOUT gst_audit_trail")
print(SEP)

g1_count = 0
g2_count = 0
g3_count = 0
g_none = 0

for rec in missing_audit:
    ext = rec.extracted_data or {}
    gate1 = (
        rec.status in ['VOUCHER_CREATED', 'COMPLETED', 'DUPLICATE', 'FAILED', 'ERROR']
        or (rec.status == 'FINALIZED' and rec.processed is True)
        or rec.processed is True
        or rec.validation_status in ['VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']
    )
    gate2 = ext.get('is_canonical_frozen') is True
    val_rev_dict = ext.get('validation_revision') if isinstance(ext.get('validation_revision'), dict) else None
    stored_hash = val_rev_dict.get('hash') if val_rev_dict else None
    current_hash = get_dto_hash(ext)
    gate3 = stored_hash and stored_hash == current_hash and rec.processed is True

    if gate1: g1_count += 1
    elif gate2: g2_count += 1
    elif gate3: g3_count += 1
    else: g_none += 1

print(f"Blocked by GATE1 (is_already_finalized/processed=True) : {g1_count}")
print(f"Blocked by GATE2 (is_canonical_frozen, not processed)  : {g2_count}")
print(f"Blocked by GATE3 (hash skip)                          : {g3_count}")
print(f"None of above (GST engine ran but dropped audit trail) : {g_none}")
