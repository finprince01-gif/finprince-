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

for page in InvoicePageResult.objects.filter(record_id="1004965", page_number__in=[1, 2, 4, 5, 7, 8]):
    payload = page.canonical_payload or {}
    print(f"Page {page.page_number}:")
    print(f"  invoice_no: {payload.get('invoice_no')}")
    print(f"  items count: {len(payload.get('items', [])) if payload.get('items') else 0}")
    print(f"  items: {payload.get('items')}")
    print(f"  total_invoice_value: {payload.get('total_invoice_value')}")
