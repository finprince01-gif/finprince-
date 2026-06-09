import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoicePageResult, InvoiceTempOCR

# Let's find pages 7 and 8 for the 3 records:
records = [1005401, 1005418, 1005432]
for rid in records:
    pages = InvoicePageResult.objects.filter(record_id=rid, page_number__in=[7, 8])
    print(f"=== Record {rid} ===")
    for p in pages:
        payload = p.canonical_payload or {}
        print(f"  Page {p.page_number}:")
        # Print details from canonical_payload
        print(f"    invoice_no     : {payload.get('invoice_no')}")
        print(f"    gstin          : {payload.get('gstin')}")
        print(f"    vendor_name    : {payload.get('vendor_name')}")
        print(f"    page_role      : {payload.get('_page_role')}")
        print(f"    raw_gstin      : {payload.get('raw_gstin')}")
        print(f"    canonical_gstin: {payload.get('canonical_gstin')}")
        print(f"    is_failed      : {p.is_failed}")
