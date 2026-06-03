import os
import sys
import django

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR

for rid in ["1004965", "1004966", "1004968", "1004970", "1004971"]:
    rec = InvoiceTempOCR.objects.filter(id=rid).first()
    if rec:
        print(f"Record ID: {rid}")
        print(f"  supplier_invoice_no: {rec.supplier_invoice_no}")
        print(f"  validation_status: {rec.validation_status}")
        ext = rec.extracted_data or {}
        print(f"  items count: {len(ext.get('items', []))}")
        print(f"  items: {ext.get('items')}")
        print(f"  total_invoice_value: {ext.get('total_invoice_value')}")
    else:
        print(f"Record {rid} not found.")
