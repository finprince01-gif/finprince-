import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult

# 1. Search by invoice number
records = InvoiceTempOCR.objects.filter(supplier_invoice_no='5081/25-26')
print(f"Found {len(records)} records by invoice number:")
for r in records:
    print(f"  ID: {r.id} | Path: {r.file_path} | gstin: {r.gstin} | is_primary: {r.is_primary} | status: {r.status} | val_status: {r.validation_status}")

# 2. Search by file name
records_file = InvoiceTempOCR.objects.filter(file_path__icontains='IMG_20260406_0005.pdf')
print(f"Found {len(records_file)} records by file path:")
for r in records_file:
    print(f"  ID: {r.id} | Path: {r.file_path} | Invoice No: {r.supplier_invoice_no} | gstin: {r.gstin} | is_primary: {r.is_primary} | status: {r.status}")
