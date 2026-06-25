"""Query DB: check latest PendingPurchase gst_audit_trail presence."""
import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR

print("=" * 70)
print("PENDING PURCHASE — LATEST 3 RECORDS")
print("=" * 70)

for pp in PendingPurchase.objects.order_by('-updated_at')[:3]:
    ext = pp.extraction_payload or {}
    print(f"\nPP id={pp.id} invoice={pp.invoice_number}")
    print(f"  vendor_status  : {pp.vendor_status}")
    print(f"  item_status    : {pp.item_status}")
    print(f"  voucher_status : {pp.voucher_status}")
    print(f"  extraction_payload keys: {list(ext.keys()) if ext else 'None/empty'}")
    audit = ext.get('gst_audit_trail')
    resolution = ext.get('gst_resolution')
    print(f"  gst_audit_trail   : {audit}")
    print(f"  gst_resolution    : {resolution}")

    # Now check the InvoiceTempOCR source record
    staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
    if staging:
        s_ext = staging.extracted_data or {}
        s_audit = s_ext.get('gst_audit_trail')
        print(f"  [STAGING] validation_status : {staging.validation_status}")
        print(f"  [STAGING] gst_audit_trail   : {s_audit}")
        print(f"  [STAGING] extracted_data keys: {list(s_ext.keys())}")
    else:
        print(f"  [STAGING] NOT FOUND (source_scan_row_id={pp.source_scan_row_id})")

print("\n" + "=" * 70)
print("TOTAL PENDING PURCHASES:", PendingPurchase.objects.count())
print("TOTAL WITH gst_audit_trail in extraction_payload:")
count = 0
for pp in PendingPurchase.objects.all():
    if (pp.extraction_payload or {}).get('gst_audit_trail'):
        count += 1
print(" ", count)
