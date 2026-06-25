import django, os, sys, json
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

def inspect_record_1007736():
    """
    Focus on the exact record shown in the screenshot:
    - InvoiceTempOCR ID 1007736 (last session, showing in UI at 17:30:19)
    - Check what gst_audit_trail and gst_resolution values are present
    - Determine exactly why getGstStatus() returns 'GST_NOT_CHECKED'
    """
    r = InvoiceTempOCR.objects.get(id=1007736)
    ext = r.extracted_data or {}

    print("=" * 80)
    print(f"RECORD: InvoiceTempOCR id={r.id}")
    print(f"supplier_invoice_no: {r.supplier_invoice_no}")
    print(f"validation_status:   {r.validation_status}")
    print(f"status:              {r.status}")
    print(f"processed:           {r.processed}")
    print(f"vendor_id:           {r.vendor_id}")
    print(f"upload_session_id:   {r.upload_session_id}")
    print(f"file_hash:           {r.file_hash}")
    print()

    gst_audit_trail = ext.get('gst_audit_trail')
    gst_resolution   = ext.get('gst_resolution')

    print(f"gst_audit_trail:     {json.dumps(gst_audit_trail, indent=2)}")
    print(f"gst_resolution:      {gst_resolution}")
    print()

    # Simulate getGstStatus() frontend logic
    print("=" * 80)
    print("SIMULATING getGstStatus() frontend function:")
    res = gst_resolution
    if res == 'CORRECTED':
        print("=> GST_CORRECTED")
    elif res == 'SUPPLIER_VALUES_ACCEPTED':
        print("=> GST_SUPPLIER_ACCEPTED")
    elif gst_audit_trail:
        if gst_audit_trail.get('validation_status') == 'FAIL':
            print("=> GST_MISMATCH")
        elif gst_audit_trail.get('validation_status') == 'PASS':
            print("=> GST_VALID")
        else:
            print(f"=> Unexpected audit validation_status: {gst_audit_trail.get('validation_status')}")
    else:
        print("=> GST_NOT_CHECKED  (because gst_audit_trail is None/missing)")
    print()

    # Check PendingPurchase
    pp_all = PendingPurchase.objects.filter(source_scan_row_id=r.id)
    print(f"PendingPurchase linked to source_scan_row_id={r.id}: {pp_all.count()}")

    # ALSO check what the API response from the view would send
    print()
    print("=" * 80)
    print("WHAT THE API RESPONSE 'extracted_data' WOULD CONTAIN FOR THIS RECORD:")
    keys_with_gst = [k for k in ext.keys() if 'gst' in k.lower()]
    print(f"GST-related keys in extracted_data: {keys_with_gst}")
    print()

    # Check if there's a PendingPurchase that shows this in the UI
    # The UI is filtered by scan_session_id, let's find the scan session ID for this record
    print(f"upload_session_id used by this record: {r.upload_session_id}")
    # List all records with same session
    session_records = list(InvoiceTempOCR.objects.filter(upload_session_id=r.upload_session_id).order_by('id'))
    print(f"Records in session {r.upload_session_id}: {[s.id for s in session_records]}")

    # Also check if the UI loads from PendingPurchase - let's see all pending purchases for this session
    pp_session = PendingPurchase.objects.filter(scan_session_id=r.upload_session_id)
    print(f"PendingPurchases for scan_session_id={r.upload_session_id}: {pp_session.count()}")
    for pp in pp_session:
        pp_ext = pp.extraction_payload or {}
        pp_gst_audit = pp_ext.get('gst_audit_trail')
        print(f"  PP id={pp.id} source_scan_row_id={pp.source_scan_row_id} status={pp.pending_purchase_status}")
        print(f"  PP gst_audit_trail: {json.dumps(pp_gst_audit, indent=2)}")
        print(f"  PP gst_resolution: {pp_ext.get('gst_resolution')}")

if __name__ == "__main__":
    inspect_record_1007736()
