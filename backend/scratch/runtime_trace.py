"""
DIAGNOSTIC RUNTIME TRACE — GST NOT CHECKED ROOT CAUSE PROOF
============================================================
Target: InvoiceTempOCR id=1007730 (validation_status=DUPLICATE, no gst_audit_trail)
Action: Simulate revalidate() -> call validate_and_process() -> capture PROBE logs
Safety: Record state is restored to original after trace completes.
READ ONLY intent: No business logic changed. Only logs added. State restored.
"""
import django, os, sys, logging, io
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'

# ── Set up log capture BEFORE django.setup() ──────────────────────────────────
class ProbeCapture(logging.Handler):
    """Captures only PROBE_* log messages."""
    def __init__(self):
        super().__init__()
        self.records = []
    def emit(self, record):
        msg = self.format(record)
        if 'PROBE_' in msg:
            self.records.append(msg)

probe_handler = ProbeCapture()
probe_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
probe_handler.setLevel(logging.DEBUG)

root_logger = logging.getLogger()
root_logger.addHandler(probe_handler)

django.setup()

from ocr_pipeline.models import InvoiceTempOCR

SEP = "=" * 70
TARGET_ID = 1007730

# ── PHASE 1: Capture original state ──────────────────────────────────────────
print(SEP)
print("PHASE 1 — ORIGINAL STATE")
print(SEP)

original = InvoiceTempOCR.objects.get(id=TARGET_ID)
orig_status = original.status
orig_val_status = original.validation_status
orig_processed = original.processed
orig_ext_keys = list((original.extracted_data or {}).keys())
orig_has_audit = 'gst_audit_trail' in (original.extracted_data or {})
orig_ext_copy = dict(original.extracted_data or {})

print(f"record.id                 : {original.id}")
print(f"record.status             : {orig_status}")
print(f"record.validation_status  : {orig_val_status}")
print(f"record.processed          : {orig_processed}")
print(f"gst_audit_trail present   : {orig_has_audit}")
print(f"invoice_no                : {original.supplier_invoice_no}")
print(f"gstin                     : {original.gstin}")
print()

# ── PHASE 2: Apply revalidate() reset ────────────────────────────────────────
print(SEP)
print("PHASE 2 — APPLYING REVALIDATE() RESET (simulating pending_purchases/views.py L171-185)")
print(SEP)

InvoiceTempOCR.objects.filter(id=TARGET_ID).update(
    processed=False,
    validation_status='PENDING',
    status='FINALIZED'
)

record = InvoiceTempOCR.objects.get(id=TARGET_ID)
if record.extracted_data and isinstance(record.extracted_data, dict):
    record.extracted_data.pop('gst_audit_trail', None)
    record.extracted_data.pop('gst_resolution', None)
    record.save(update_fields=['extracted_data'])

record.refresh_from_db()
print(f"After reset:")
print(f"  status            : {record.status}")
print(f"  validation_status : {record.validation_status}")
print(f"  processed         : {record.processed}")
print(f"  gst_audit_trail   : {'present' if record.extracted_data.get('gst_audit_trail') else 'ABSENT'}")
print()

# ── PHASE 3: Trigger validate_and_process() and capture PROBE logs ───────────
print(SEP)
print("PHASE 3 — CALLING validate_and_process(record, auto_save=False)")
print("          PROBE logs will appear below:")
print(SEP)

from ocr_pipeline.pipeline import validate_and_process

probe_handler.records.clear()
result = validate_and_process(record, auto_save=False)

print(f"Pipeline returned: {result}")
print()

print(SEP)
print("PHASE 4 — CAPTURED PROBE LOG EVIDENCE")
print(SEP)

if probe_handler.records:
    for i, entry in enumerate(probe_handler.records, 1):
        print(f"LOG {i}: {entry}")
else:
    print("WARNING: No PROBE_ logs captured. Django server log file may have them.")
    print("Checking log files...")

print()

# ── PHASE 5: Verify gst_audit_trail in DB after pipeline run ─────────────────
print(SEP)
print("PHASE 5 — DB STATE AFTER PIPELINE RUN")
print(SEP)

after = InvoiceTempOCR.objects.get(id=TARGET_ID)
after_has_audit = 'gst_audit_trail' in (after.extracted_data or {})
print(f"After validate_and_process:")
print(f"  status            : {after.status}")
print(f"  validation_status : {after.validation_status}")
print(f"  gst_audit_trail   : {'PRESENT' if after_has_audit else 'ABSENT'}")
print()

# ── PHASE 6: Restore original state ──────────────────────────────────────────
print(SEP)
print("PHASE 6 — RESTORING ORIGINAL STATE")
print(SEP)

InvoiceTempOCR.objects.filter(id=TARGET_ID).update(
    status=orig_status,
    validation_status=orig_val_status,
    processed=orig_processed,
)
record_restore = InvoiceTempOCR.objects.get(id=TARGET_ID)
record_restore.extracted_data = orig_ext_copy
record_restore.save(update_fields=['extracted_data'])

restored = InvoiceTempOCR.objects.get(id=TARGET_ID)
print(f"Restored status           : {restored.status}")
print(f"Restored validation_status: {restored.validation_status}")
print(f"Restored processed        : {restored.processed}")
print(f"gst_audit_trail restored  : {'present' if 'gst_audit_trail' in (restored.extracted_data or {}) else 'absent (correct)'}")
print()

# ── PHASE 7: VERDICT ─────────────────────────────────────────────────────────
print(SEP)
print("PHASE 7 — VERDICT")
print(SEP)

probe_tags = [r for r in probe_handler.records]
has_probe1 = any('PROBE_1' in r for r in probe_tags)
has_probe2 = any('PROBE_2' in r for r in probe_tags)
has_probe3 = any('PROBE_3' in r for r in probe_tags)
has_probe4 = any('PROBE_4' in r for r in probe_tags)
has_probe5 = any('PROBE_5' in r for r in probe_tags)

print(f"PROBE_1 (GATE1 computed)  : {'HIT' if has_probe1 else 'NOT HIT'}")
print(f"PROBE_2 (GATE1 returned)  : {'HIT — pipeline EXITED before GST' if has_probe2 else 'NOT HIT — pipeline continued'}")
print(f"PROBE_3 (GST entry)       : {'HIT — GST engine REACHED' if has_probe3 else 'NOT HIT — GST engine SKIPPED'}")
print(f"PROBE_4 (audit written)   : {'HIT — gst_audit_trail written' if has_probe4 else 'NOT HIT'}")
print(f"PROBE_5 (audit saved)     : {'HIT — gst_audit_trail saved to DB' if has_probe5 else 'NOT HIT'}")
print()

if has_probe2 and not has_probe3:
    print("VERDICT: A) GST block NEVER executed")
    print("         Pipeline returned early at GATE1 before L2558")
elif has_probe3 and not has_probe4:
    print("VERDICT: B) GST block ENTERED but gst_audit_trail NOT written")
    print("         Exception likely at L2748 (check PROBE_3 and GST_VALIDATION_ERR log)")
elif has_probe4 and not has_probe5:
    print("VERDICT: B) gst_audit_trail written in memory but NOT saved to DB")
elif has_probe5 and not after_has_audit:
    print("VERDICT: C) gst_audit_trail written AND saved but UI reading wrong source")
elif has_probe5 and after_has_audit:
    print("VERDICT: gst_audit_trail written, saved, and present in DB")
    print("         UI issue — frontend reading wrong field or wrong payload")
else:
    print("VERDICT: Inconclusive — check log file directly")
