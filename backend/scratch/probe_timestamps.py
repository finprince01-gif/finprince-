"""Timestamp probe fixed — use created_at."""
import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.models import InvoiceTempOCR

SEP = "=" * 70

print(SEP)
print("DUPLICATE records without gst_audit_trail - TIMESTAMPS")
print(SEP)

no_audit_recs = []
for rec in InvoiceTempOCR.objects.filter(is_primary=True).order_by('-id')[:200]:
    ext = rec.extracted_data or {}
    if ext.get('gst_audit_trail') is None:
        no_audit_recs.append(rec)
        val_rev = ext.get('validation_revision')
        ts = val_rev.get('timestamp') if isinstance(val_rev, dict) else 'NOT SET'
        ver = val_rev.get('version') if isinstance(val_rev, dict) else None
        print(f"id={rec.id} created_at={rec.created_at}")
        print(f"  validation_rev.ts   : {ts}")
        print(f"  validation_rev.ver  : {ver}")
        print(f"  validation_status   : {rec.validation_status}")
        print(f"  status              : {rec.status}")
        print(f"  is_canonical_frozen : {ext.get('is_canonical_frozen')}")
        items = ext.get('items', [])
        print(f"  items count         : {len(items)}")
        print()

print(SEP)
print("Records WITH gst_audit_trail - TIMESTAMPS (most recent 5)")
print(SEP)

has_audit_recs = []
for rec in InvoiceTempOCR.objects.filter(is_primary=True).order_by('-id')[:200]:
    ext = rec.extracted_data or {}
    if ext.get('gst_audit_trail') is not None:
        has_audit_recs.append(rec)
        if len(has_audit_recs) <= 3:
            val_rev = ext.get('validation_revision')
            ts = val_rev.get('timestamp') if isinstance(val_rev, dict) else 'NOT SET'
            ver = val_rev.get('version') if isinstance(val_rev, dict) else None
            audit = ext.get('gst_audit_trail', {})
            print(f"id={rec.id} created_at={rec.created_at}")
            print(f"  validation_rev.ts   : {ts}")
            print(f"  validation_rev.ver  : {ver}")
            print(f"  gst_audit_trail.validation_status : {audit.get('validation_status')}")
            print()

print(SEP)
print("TIMESTAMP COMPARISON")
print(SEP)

# Compare: are no-audit records older than has-audit records?
if no_audit_recs and has_audit_recs:
    no_audit_ids = [r.id for r in no_audit_recs]
    has_audit_ids = [r.id for r in has_audit_recs]
    print(f"No-audit IDs  (min, max): {min(no_audit_ids)}, {max(no_audit_ids)}")
    print(f"Has-audit IDs (min, max): {min(has_audit_ids)}, {max(has_audit_ids)}")
    
    # Are no-audit IDs all NEWER than has-audit? (Recent DUPLICATE scans missed GST engine)
    # Or all OLDER (processed before GST engine existed)?
    min_has = min(has_audit_ids)
    max_no = max(no_audit_ids)
    print()
    if max_no < min_has:
        print("RESULT: All no-audit records are OLDER than has-audit records.")
        print("        These were processed before the GST engine was added.")
    elif min(no_audit_ids) > max(has_audit_ids):
        print("RESULT: All no-audit records are NEWER than has-audit records.")
        print("        GST engine is FAILING on these records (recent regression).")
    else:
        print("RESULT: IDs are interleaved — both old and new records lack gst_audit_trail.")
        print("        Root cause is NOT about when the records were created.")
        print("        Something about DUPLICATE classification prevents GST write.")
        
        # Check: are ALL no-audit records DUPLICATE?
        no_audit_dupe = [r for r in no_audit_recs if r.validation_status == 'DUPLICATE']
        no_audit_other = [r for r in no_audit_recs if r.validation_status != 'DUPLICATE']
        print(f"        No-audit that are DUPLICATE: {len(no_audit_dupe)}")
        print(f"        No-audit that are NON-DUPLICATE: {len(no_audit_other)}")
        
        has_audit_dupe = [r for r in has_audit_recs if r.validation_status == 'DUPLICATE']
        print(f"        Has-audit that are DUPLICATE: {len(has_audit_dupe)}")
        
        if has_audit_dupe:
            print("        => Some DUPLICATE records DO have gst_audit_trail.")
            print("           The no-audit DUPLICATE records must have been processed via a DIFFERENT code path.")
        else:
            print("        => NO DUPLICATE records have gst_audit_trail.")
            print("           The GST engine is ALWAYS blocked for DUPLICATE records.")
