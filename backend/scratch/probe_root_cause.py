"""
DEFINITIVE ROOT CAUSE PROBE — GST Status NOT CHECKED
Single record end-to-end trace.
READ ONLY — no DB writes.
"""
import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR

SEP = "=" * 70

# ── PHASE 1: Pick the target record ───────────────────────────────────────────
# Choose PP 2407 (VMT25-26/127) — ALREADY EXIST x3, no gst_audit_trail
TARGET_PP_ID = 2407

pp = PendingPurchase.objects.get(id=TARGET_PP_ID)
staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()

print(SEP)
print("PHASE 1 — TARGET RECORD")
print(SEP)
print(f"PendingPurchase.id        : {pp.id}")
print(f"PendingPurchase.invoice   : {pp.invoice_number}")
print(f"source_scan_row_id        : {pp.source_scan_row_id}")
print(f"vendor_status             : {pp.vendor_status}")
print(f"item_status               : {pp.item_status}")
print(f"voucher_status            : {pp.voucher_status}")
print(f"pending_purchase_status   : {pp.pending_purchase_status}")
print()
if staging:
    print(f"InvoiceTempOCR.id         : {staging.id}")
    print(f"staging.status            : {staging.status}")
    print(f"staging.validation_status : {staging.validation_status}")
    print(f"staging.processed         : {staging.processed}")
    print(f"staging.vendor_id         : {staging.vendor_id}")
    print(f"staging.is_primary        : {staging.is_primary}")
else:
    print("STAGING RECORD: NOT FOUND")
    sys.exit(1)

# ── PHASE 2: GST ENGINE PROOF ─────────────────────────────────────────────────
print()
print(SEP)
print("PHASE 2 — GST AUDIT TRAIL IN extracted_data vs extraction_payload")
print(SEP)

s_ext = staging.extracted_data or {}
pp_ext = pp.extraction_payload or {}

s_audit = s_ext.get('gst_audit_trail')
pp_audit = pp_ext.get('gst_audit_trail')
s_resolution = s_ext.get('gst_resolution')
pp_resolution = pp_ext.get('gst_resolution')

print(f"[STAGING]         gst_audit_trail  : {s_audit}")
print(f"[PENDING_PURCHASE] gst_audit_trail : {pp_audit}")
print()
print(f"[STAGING]         gst_resolution   : {s_resolution}")
print(f"[PENDING_PURCHASE] gst_resolution  : {pp_resolution}")
print()
print(f"[STAGING]         extracted_data keys ({len(s_ext)}):")
print(f"  {sorted(s_ext.keys())}")
print()
print(f"[PENDING_PURCHASE] extraction_payload keys ({len(pp_ext)}):")
print(f"  {sorted(pp_ext.keys())}")

# ── PHASE 3: EXACT DIFF ───────────────────────────────────────────────────────
print()
print(SEP)
print("PHASE 3 — EXACT DIFF: staging.extracted_data vs pp.extraction_payload")
print(SEP)

s_keys = set(s_ext.keys())
pp_keys = set(pp_ext.keys())

only_in_staging = s_keys - pp_keys
only_in_pp = pp_keys - s_keys
print(f"Keys ONLY in staging.extracted_data      : {sorted(only_in_staging)}")
print(f"Keys ONLY in pp.extraction_payload       : {sorted(only_in_pp)}")

same_keys = s_keys & pp_keys
value_diffs = []
for k in sorted(same_keys):
    sv = s_ext.get(k)
    pv = pp_ext.get(k)
    if sv != pv:
        value_diffs.append(k)
print(f"Keys present in both but VALUE DIFFERS   : {value_diffs}")

# ── PHASE 4: IS_ALREADY_FINALIZED CHECK ───────────────────────────────────────
print()
print(SEP)
print("PHASE 4 — EARLY RETURN GATE: is_already_finalized (pipeline.py L2194-2203)")
print(SEP)

is_already_finalized = (
    staging.status in ['VOUCHER_CREATED', 'COMPLETED', 'DUPLICATE', 'FAILED', 'ERROR']
    or (staging.status == 'FINALIZED' and getattr(staging, 'processed', False) is True)
    or getattr(staging, 'processed', False) is True
    or staging.validation_status in ['VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']
)

print(f"staging.status                            : '{staging.status}'")
print(f"staging.processed                         : {staging.processed}")
print(f"staging.validation_status                 : '{staging.validation_status}'")
print(f"status in terminal set                    : {staging.status in ['VOUCHER_CREATED','COMPLETED','DUPLICATE','FAILED','ERROR']}")
print(f"status==FINALIZED AND processed==True     : {staging.status == 'FINALIZED' and staging.processed is True}")
print(f"processed is True                         : {staging.processed is True}")
print(f"validation_status in duplicate set        : {staging.validation_status in ['VOUCHER_CREATED','DUPLICATE','DUPLICATE_IN_BATCH','DUPLICATE_INVOICE']}")
print()
print(f">>> is_already_finalized = {is_already_finalized}")
print()
if is_already_finalized:
    print("RESULT: Pipeline would EXIT at L2203 BEFORE reaching GST engine (L2558)")
    print("        gst_audit_trail is NEVER written by this code path.")
else:
    print("RESULT: Pipeline would CONTINUE past L2203 and reach GST engine at L2558")

# ── PHASE 5: CANONICAL FREEZE CHECK ──────────────────────────────────────────
print()
print(SEP)
print("PHASE 5 — CANONICAL FREEZE BYPASS (pipeline.py L2210-2212)")
print(SEP)

is_processed = staging.processed is True
has_validation = staging.validation_status and staging.validation_status != 'PENDING'
is_frozen = s_ext.get('is_canonical_frozen', False)

print(f"is_canonical_frozen in extracted_data     : {is_frozen}")
print(f"processed                                 : {is_processed}")
print(f"has_validation (not PENDING)              : {has_validation}")
print(f"auto_save would be False (revalidate)     : True")
freeze_bypass = is_frozen and not False and is_processed and has_validation  # auto_save=False
print(f">>> CANONICAL_FREEZE_BYPASS would trigger : {freeze_bypass}")
if freeze_bypass:
    print("RESULT: Pipeline would EXIT at L2212 — GST engine NEVER reached")

# ── PHASE 6: VALIDATION_SKIPPED hash check ────────────────────────────────────
print()
print(SEP)
print("PHASE 6 — VALIDATION_SKIPPED_ALREADY_VALIDATED (pipeline.py L2216-2218)")
print(SEP)

from ocr_pipeline.integrity_enforcer import get_dto_hash
current_hash = get_dto_hash(s_ext)
val_rev = s_ext.get('validation_revision')
stored_hash = val_rev.get('hash') if isinstance(val_rev, dict) else None

print(f"current DTO hash          : {current_hash}")
print(f"stored hash (val_rev)     : {stored_hash}")
print(f"hashes match              : {current_hash == stored_hash}")
print(f"processed                 : {is_processed}")
print(f"has_validation            : {has_validation}")
hash_skip = (stored_hash == current_hash) and not False and is_processed and has_validation
print(f">>> VALIDATION_SKIPPED would trigger      : {hash_skip}")
if hash_skip:
    print("RESULT: Pipeline would EXIT at L2218 — GST engine NEVER reached")

# ── PHASE 7: DETERMINE EXACT FAILURE POINT ───────────────────────────────────
print()
print(SEP)
print("PHASE 7 — DEFINITIVE ROOT CAUSE")
print(SEP)

if is_already_finalized:
    print("ROOT CAUSE: A — Pipeline exits at L2203 (is_already_finalized gate)")
    print("  Trigger condition: staging.processed=True")
    print("  GST engine at L2558 is NEVER reached during revalidate()")
    print("  gst_audit_trail is therefore NEVER written to extracted_data")
    print("  evaluate_pending_purchase copies stale extracted_data (no gst_audit_trail)")
elif freeze_bypass:
    print("ROOT CAUSE: B — Pipeline exits at L2212 (is_canonical_frozen gate)")
    print("  GST engine at L2558 is NEVER reached")
elif hash_skip:
    print("ROOT CAUSE: C — Pipeline exits at L2218 (validation_revision hash gate)")
    print("  GST engine at L2558 is NEVER reached")
else:
    print("ROOT CAUSE: D — Pipeline reaches GST engine but something else fails")
    print("  GST engine at L2558 IS reached")
    if s_audit:
        print("  gst_audit_trail IS in staging.extracted_data")
        if not pp_audit:
            print("  BUT gst_audit_trail NOT in pp.extraction_payload")
            print("  -> evaluate_pending_purchase did not copy it (stale snapshot)")
    else:
        print("  gst_audit_trail NOT in staging.extracted_data")
        print("  -> GST engine may have thrown exception (silent swallow at L2748)")
