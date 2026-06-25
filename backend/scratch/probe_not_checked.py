"""
Deep-trace PP 2525, 2522, 2521 — pp_audit=False.
Find out WHY their extraction_payload has no gst_audit_trail
when their staging record ALSO has no staging_audit.

Hypothesis: staging record (InvoiceTempOCR) does not exist OR 
its extracted_data lacks gst_audit_trail at the time the PP snapshot was taken.
"""
import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR

SEP = "=" * 70

for pp_id in [2525, 2522, 2521]:
    pp = PendingPurchase.objects.get(id=pp_id)
    pp_ext = pp.extraction_payload or {}
    pp_audit = pp_ext.get('gst_audit_trail')

    print(SEP)
    print(f"PP id={pp_id} | source_scan_row_id={pp.source_scan_row_id}")
    print(f"  vendor_status  : {pp.vendor_status}")
    print(f"  item_status    : {pp.item_status}")
    print(f"  voucher_status : {pp.voucher_status}")
    print(f"  PP.extraction_payload gst_audit_trail : {pp_audit is not None}")

    staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
    if not staging:
        print(f"  STAGING : NOT FOUND (source_scan_row_id={pp.source_scan_row_id})")
        print(f"  -> PP snapshot taken from deleted/missing staging row")
        print(f"  -> gst_audit_trail was never in the snapshot")
        print(f"  ROOT CAUSE for this record: ORPHANED staging row")
    else:
        s_ext = staging.extracted_data or {}
        s_audit = s_ext.get('gst_audit_trail')
        print(f"  STAGING id       : {staging.id}")
        print(f"  STAGING status   : {staging.status}")
        print(f"  STAGING val_stat : {staging.validation_status}")
        print(f"  STAGING processed: {staging.processed}")
        print(f"  STAGING gst_audit_trail : {s_audit is not None}")
        if s_audit:
            print(f"  STAGING gst_audit_trail.validation_status : {s_audit.get('validation_status')}")
        print()
        
        # Check if pp.extraction_payload == staging.extracted_data
        pp_keys = set(pp_ext.keys())
        s_keys = set(s_ext.keys())
        in_staging_not_pp = s_keys - pp_keys
        print(f"  Keys in staging.extracted_data but NOT in pp.extraction_payload:")
        print(f"  {sorted(in_staging_not_pp)}")

        val_rev = s_ext.get('validation_revision')
        ts = val_rev.get('timestamp') if isinstance(val_rev, dict) else 'NOT SET'
        ver = val_rev.get('version') if isinstance(val_rev, dict) else None
        print(f"  STAGING validation_revision.version : {ver}")
        print(f"  STAGING validation_revision.ts      : {ts}")

        # Is the snapshot stale? Compare via version
        pp_val_rev = pp_ext.get('validation_revision')
        pp_ver = pp_val_rev.get('version') if isinstance(pp_val_rev, dict) else None
        pp_ts = pp_val_rev.get('timestamp') if isinstance(pp_val_rev, dict) else None
        print(f"  PP extraction_payload validation_revision.version : {pp_ver}")
        print(f"  PP extraction_payload validation_revision.ts      : {pp_ts}")

        if ver != pp_ver:
            print(f"  VERSION MISMATCH: staging={ver}, pp_snapshot={pp_ver}")
            print(f"  -> PP snapshot is STALE — taken from older version of extracted_data")
            print(f"  -> At time of snapshot, gst_audit_trail was not yet present (version {pp_ver})")
            print(f"  ROOT CAUSE: Stale extraction_payload snapshot (pipeline ran again and updated")
            print(f"              staging.extracted_data, but PendingPurchase was not re-evaluated)")
        elif not s_audit:
            print(f"  STAGING also lacks gst_audit_trail — same root cause in staging")
            print(f"  ROOT CAUSE: GST engine never ran for this staging record")
        else:
            print(f"  VERSION matches but gst_audit_trail missing from PP only")
            print(f"  ROOT CAUSE: evaluate_pending_purchase did not copy gst_audit_trail")
    print()
