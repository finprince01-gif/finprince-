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

recs = InvoiceTempOCR.objects.all().order_by('-id')[:20]
print("Recent records:")
for r in recs:
    print(f"ID: {r.id} | Path: {r.file_path} | Invoice No: {r.supplier_invoice_no} | Status: {r.status} | Validation Status: {r.validation_status}")
