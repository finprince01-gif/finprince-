import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoicePageResult, InvoiceTempOCR

# Find the latest session_id from InvoicePageResult
latest_page = InvoicePageResult.objects.order_by('-created_at').first()
if not latest_page:
    print("No page results found in DB.")
    sys.exit(0)

session_id = latest_page.session_id
print(f"Latest Session ID from Page Results: {session_id}")

pages = InvoicePageResult.objects.filter(session_id=session_id).order_by('page_number')
print(f"Total Pages: {len(pages)}")
for p in pages:
    payload = p.canonical_payload or {}
    ocr_text = payload.get('_pdf_ocr_text') or payload.get('_raw_text') or ''
    print(f"  Page {p.page_number}:")
    print(f"    invoice_no     : {payload.get('invoice_no')}")
    print(f"    gstin          : {payload.get('gstin')}")
    print(f"    page_role      : {payload.get('_page_role')}")
    print(f"    ocr_text_len   : {len(ocr_text)}")
    print(f"    is_failed      : {p.is_failed}")
