"""
PHASE 4-5: Exact failure-point trace for one DUPLICATE record.
Prove: revalidate() cannot fix this because the record never reaches the GST engine.
"""
import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

SEP = "=" * 70

# Target: id=1007730 (most recent, validation_status=DUPLICATE, no gst_audit_trail)
TARGET_STAGING_ID = 1007730

rec = InvoiceTempOCR.objects.get(id=TARGET_STAGING_ID)
ext = rec.extracted_data or {}

print(SEP)
print(f"TARGET: InvoiceTempOCR id={rec.id}")
print(SEP)
print(f"status            : {rec.status}")
print(f"validation_status : {rec.validation_status}")
print(f"processed         : {rec.processed}")
print(f"invoice_no        : {rec.supplier_invoice_no}")
print(f"gstin             : {rec.gstin}")
print()

# Find related PendingPurchase
pp = PendingPurchase.objects.filter(source_scan_row_id=rec.id).first()
if pp:
    print(f"PendingPurchase id   : {pp.id}")
    print(f"vendor_status        : {pp.vendor_status}")
    print(f"item_status          : {pp.item_status}")
    print(f"voucher_status       : {pp.voucher_status}")
    pp_ext = pp.extraction_payload or {}
    print(f"gst_audit in PP      : {pp_ext.get('gst_audit_trail') is not None}")
else:
    print("No PendingPurchase linked to this staging record")

print()
print(SEP)
print("SIMULATING: validate_and_process() with auto_save=False")
print("Tracing exact code path (READ ONLY simulation)")
print(SEP)

print()
print("Step 1 — revalidate() in views.py L171-185:")
print(f"  InvoiceTempOCR.objects.filter(id={rec.id}).update(")
print(f"    processed=False,")
print(f"    validation_status='PENDING',")
print(f"    status='FINALIZED')")
print()
# Simulate what revalidate does: reset processed=False, validation_status=PENDING, status=FINALIZED
# Then check if GATE1 would trigger
simulated_processed = False
simulated_val_status = 'PENDING'
simulated_status = 'FINALIZED'

print("Step 2 — pipeline.py L2194-2203: is_already_finalized check AFTER revalidate reset")
gate1_after_reset = (
    simulated_status in ['VOUCHER_CREATED', 'COMPLETED', 'DUPLICATE', 'FAILED', 'ERROR']
    or (simulated_status == 'FINALIZED' and simulated_processed is True)
    or simulated_processed is True
    or simulated_val_status in ['VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']
)
print(f"  simulated status            : '{simulated_status}'")
print(f"  simulated processed         : {simulated_processed}")
print(f"  simulated validation_status : '{simulated_val_status}'")
print(f"  >>> is_already_finalized after reset : {gate1_after_reset}")

if not gate1_after_reset:
    print()
    print("Step 3 — pipeline.py L2210-2212: is_canonical_frozen check")
    is_frozen = ext.get('is_canonical_frozen', False)
    is_proc_after_reset = simulated_processed is True
    has_val_after_reset = simulated_val_status and simulated_val_status != 'PENDING'
    gate2_after_reset = is_frozen and not False and is_proc_after_reset and has_val_after_reset
    print(f"  is_canonical_frozen : {is_frozen}")
    print(f"  processed           : {is_proc_after_reset}")
    print(f"  has_validation      : {has_val_after_reset}")
    print(f"  >>> CANONICAL_FREEZE_BYPASS triggers : {gate2_after_reset}")

    print()
    print("Step 4 — pipeline.py L2216-2218: validation_revision hash check")
    from ocr_pipeline.integrity_enforcer import get_dto_hash
    current_hash = get_dto_hash(ext)
    val_rev = ext.get('validation_revision') if isinstance(ext.get('validation_revision'), dict) else None
    stored_hash = val_rev.get('hash') if val_rev else None
    gate3_after_reset = (stored_hash == current_hash) and not False and is_proc_after_reset and has_val_after_reset
    print(f"  current_hash        : {current_hash[:16]}...")
    print(f"  stored_hash         : {stored_hash[:16] if stored_hash else None}")
    print(f"  hashes match        : {stored_hash == current_hash}")
    print(f"  >>> VALIDATION_SKIPPED triggers : {gate3_after_reset}")

    if not gate2_after_reset and not gate3_after_reset:
        print()
        print("  GST engine WOULD be reached at L2558.")
        print("  If GST engine runs and writes gst_audit_trail:")
        print("  -> evaluate_pending_purchase copies it to PendingPurchase.extraction_payload")
        print("  -> The problem would resolve itself after revalidate()")

print()
print(SEP)
print("STEP 5 — pipeline.py L2257-2259: COMPLETED/SPLIT_COMPLETE gate")
print(SEP)
print(f"  simulated status='{simulated_status}' in ['COMPLETED','SPLIT_COMPLETE'] : {simulated_status in ['COMPLETED', 'SPLIT_COMPLETE']}")
gate_completed = simulated_status in ['COMPLETED', 'SPLIT_COMPLETE']
print(f"  >>> This gate BLOCKS? : {gate_completed}")

print()
print(SEP)
print("DEFINITIVE ANSWER")
print(SEP)

if gate1_after_reset:
    print("ROOT CAUSE CONFIRMED: GATE1 (is_already_finalized) at pipeline.py L2200-2203")
    print()
    print("The EXACT blocking condition for this record:")
    triggers = []
    if simulated_status in ['VOUCHER_CREATED', 'COMPLETED', 'DUPLICATE', 'FAILED', 'ERROR']:
        triggers.append(f"status in terminal set (status='{simulated_status}')")
    if simulated_status == 'FINALIZED' and simulated_processed is True:
        triggers.append("status=FINALIZED AND processed=True")
    if simulated_processed is True:
        triggers.append("processed=True")
    if simulated_val_status in ['VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']:
        triggers.append(f"validation_status in duplicate set ('{simulated_val_status}')")
    for t in triggers:
        print(f"  - {t}")
    print()
    print("Wait — revalidate() RESETS these values. Let me re-check actual gate trigger.")
    print()
    print("The ACTUAL blocking condition for the ORIGINAL record (before revalidate):")
    triggers_orig = []
    if rec.status in ['VOUCHER_CREATED', 'COMPLETED', 'DUPLICATE', 'FAILED', 'ERROR']:
        triggers_orig.append(f"status='{rec.status}'")
    if rec.status == 'FINALIZED' and rec.processed is True:
        triggers_orig.append("status=FINALIZED AND processed=True")
    if rec.processed is True:
        triggers_orig.append("processed=True")
    if rec.validation_status in ['VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']:
        triggers_orig.append(f"validation_status='{rec.validation_status}'")
    for t in triggers_orig:
        print(f"  - {t}")
else:
    print("GATE1 does NOT block after revalidate() reset.")
    print("Pipeline WOULD reach the GST engine.")
    print("Root cause is different — check gate2/gate3 above.")
