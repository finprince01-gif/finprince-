import os
import sys
import django

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoicePageResult, InvoiceTempOCR

session_id = "369aba1a-e4be-4469-a3ed-7998390d2153"
print(f"Session: {session_id}")

pages = InvoicePageResult.objects.filter(session_id=session_id).order_by('page_number')
print(f"Total Page Results: {pages.count()}")
for p in pages:
    payload = p.canonical_payload or {}
    items = payload.get('items', [])
    print(f"Page {p.page_number} | Invoice No: {payload.get('invoice_no')} | Page items count: {len(items)}")
    for idx, item in enumerate(items):
        print(f"  Item {idx}: description='{item.get('description') or item.get('item_name')}' qty={item.get('qty')} taxable_value={item.get('taxable_value')}")
