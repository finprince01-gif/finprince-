import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.models import InvoiceTempOCR

# Find recent InvoiceTempOCR records where extracted_data has no gst_audit_trail and is processed or duplicate
records = InvoiceTempOCR.objects.all().order_by('-id')[:100]

print("Found records:")
count = 0
for r in records:
    ext = r.extracted_data or {}
    gst_res = ext.get('gst_resolution')
    gst_audit = ext.get('gst_audit_trail')
    
    # We want ones where gst_res is not CORRECTED / SUPPLIER_VALUES_ACCEPTED, and gst_audit is empty
    if gst_res not in ['CORRECTED', 'SUPPLIER_VALUES_ACCEPTED'] and not gst_audit:
        print(f"Record ID: {r.id}, upload_session_id: {r.upload_session_id}, validation_status: {r.validation_status}, supplier_invoice_no: {r.supplier_invoice_no}, processed: {r.processed}")
        count += 1
        if count >= 10:
            break
