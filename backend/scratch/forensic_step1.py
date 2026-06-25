import django, os, sys, json, hashlib
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

PDF_PATH = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0006.pdf"

def compute_hash(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()

def step1():
    print("=" * 80)
    print("STEP 1 -- STAGING RECORD IDENTIFICATION")
    print("=" * 80)

    file_hash = compute_hash(PDF_PATH)
    print(f"PDF path: {PDF_PATH}")
    print(f"SHA-256 file_hash: {file_hash}")

    # Query all records matching this file hash - most recent first
    records_by_hash = list(InvoiceTempOCR.objects.filter(file_hash=file_hash).order_by('-id')[:10])
    total = InvoiceTempOCR.objects.filter(file_hash=file_hash).count()
    print(f"\nTotal records with this file_hash in DB: {total}")
    print(f"Showing most recent 10:")

    for r in records_by_hash:
        print(f"\n  ID: {r.id}")
        print(f"  file_hash: {r.file_hash}")
        print(f"  upload_session_id: {r.upload_session_id}")
        print(f"  supplier_invoice_no: {r.supplier_invoice_no}")
        print(f"  validation_status: {r.validation_status}")
        print(f"  status: {r.status}")
        print(f"  vendor_status: {r.vendor_status}")
        print(f"  vendor_id: {r.vendor_id}")
        print(f"  processed: {r.processed}")
        print(f"  created_at: {r.created_at}")

        ext = r.extracted_data or {}
        print(f"  extracted_data keys: {sorted([k for k in ext.keys()])}")
        print(f"  item_status (extracted_data): {ext.get('item_status')}")
        print(f"  gst_audit_trail: {json.dumps(ext.get('gst_audit_trail'), indent=4)}")
        print(f"  gst_resolution: {ext.get('gst_resolution')}")

        # PendingPurchase
        pp = PendingPurchase.objects.filter(source_scan_row_id=r.id).first()
        if pp:
            print(f"  PendingPurchase ID: {pp.id}")
            print(f"  voucher_status: {pp.voucher_status}")
            print(f"  vendor_status: {pp.vendor_status}")
            print(f"  item_status: {pp.item_status}")
            print(f"  pending_purchase_status: {pp.pending_purchase_status}")
        else:
            print(f"  PendingPurchase: NONE")
        print("-" * 60)

    # Focus on MOST RECENT record
    if records_by_hash:
        latest = records_by_hash[0]
        print("\n")
        print("=" * 80)
        print(f"MOST RECENT RECORD: ID={latest.id}")
        print(f"This is the record shown in the UI for the last upload of this PDF")
        print("=" * 80)
        print(f"  id: {latest.id}")
        print(f"  file_hash: {latest.file_hash}")
        print(f"  upload_session_id: {latest.upload_session_id}")
        print(f"  validation_status: {latest.validation_status}")
        print(f"  status: {latest.status}")
        print(f"  vendor_status: {latest.vendor_status}")
        print(f"  supplier_invoice_no: {latest.supplier_invoice_no}")
        
        ext = latest.extracted_data or {}
        print(f"  gst_audit_trail: {json.dumps(ext.get('gst_audit_trail'))}")
        print(f"  gst_resolution: {ext.get('gst_resolution')}")

        # GST status simulation
        print()
        print("  FRONTEND getGstStatus() SIMULATION:")
        gst_res = ext.get('gst_resolution')
        gst_audit = ext.get('gst_audit_trail')
        val_status = latest.validation_status
        # Would need voucher_status from PendingPurchase or extracted_data
        pp = PendingPurchase.objects.filter(source_scan_row_id=latest.id).first()
        voucher_status = pp.voucher_status if pp else None

        print(f"  row.validation_status = '{val_status}'")
        print(f"  row.voucher_status = '{voucher_status}'")
        print(f"  ext.gst_resolution = {gst_res}")
        print(f"  ext.gst_audit_trail = {json.dumps(gst_audit)}")

        if gst_res == 'CORRECTED':
            result = 'GST_CORRECTED'
        elif gst_res == 'SUPPLIER_VALUES_ACCEPTED':
            result = 'GST_SUPPLIER_ACCEPTED'
        elif val_status in ('DUPLICATE', 'DUPLICATE_INVOICE', 'DUPLICATE_IN_BATCH') and voucher_status == 'VOUCHER_STATUS_EXISTING':
            result = 'GST_VALID'  # New fix applied
        elif gst_audit:
            if gst_audit.get('validation_status') == 'FAIL':
                result = 'GST_MISMATCH'
            elif gst_audit.get('validation_status') == 'PASS':
                result = 'GST_VALID'
            else:
                result = 'GST_NOT_CHECKED'
        else:
            result = 'GST_NOT_CHECKED'
        
        print(f"  => getGstStatus() returns: '{result}'")

if __name__ == '__main__':
    step1()
