import os, sys, django, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult

# Find record
r = InvoiceTempOCR.objects.get(id=1006138)
print("=== Record 1006138 ===")
print("file_path:", r.file_path)
print("upload_session_id:", r.upload_session_id)
print("supplier_invoice_no:", r.supplier_invoice_no)
print("gstin:", r.gstin)
print("vendor_status:", r.vendor_status)

# Print extracted_data
print("\n=== extracted_data ===")
print(json.dumps(r.extracted_data, indent=2))

# Find all page results for the session
pages = InvoicePageResult.objects.filter(session_id=r.upload_session_id).order_by('page_number')
print(f"\n=== Pages in session: {len(pages)} ===")
for p in pages:
    payload = p.canonical_payload or {}
    print(f"\n--- Page {p.page_number} ---")
    print(f"  invoice_no: {payload.get('invoice_no')}")
    print(f"  gstin: {payload.get('gstin')}")
    print(f"  vendor_gstin: {payload.get('vendor_gstin')}")
    print(f"  page_role: {payload.get('_page_role')}")
    # Search for candidate GSTIN patterns (15 characters alphanumeric starting with 33)
    import re
    text = payload.get('_pdf_ocr_text') or payload.get('_raw_text') or ''
    gstins = re.findall(r'\b33[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}\b', text.upper())
    print(f"  Found GSTINs in raw text: {list(set(gstins))}")
