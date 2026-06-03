import os
import sys
import django

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoicePageResult

for page in InvoicePageResult.objects.filter(record_id="1004965").order_by('page_number'):
    payload = page.canonical_payload or {}
    ocr_text = str(payload.get("_pdf_ocr_text") or payload.get("_raw_text") or "").strip()
    print(f"Page {page.page_number}:")
    print(f"  _error: {payload.get('_error')}")
    print(f"  len(_pdf_ocr_text): {len(str(payload.get('_pdf_ocr_text')))}")
    print(f"  len(_raw_text): {len(str(payload.get('_raw_text')))}")
    print(f"  len(ocr_text): {len(ocr_text)}")
    print(f"  ocr_text (first 50 chars): {repr(ocr_text[:50])}")
