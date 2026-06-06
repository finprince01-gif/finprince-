import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.gstin_classifier import GSTINOwnershipClassifier

# Check record 1006138
record = InvoiceTempOCR.objects.get(id=1006138)
raw_text = record.extracted_data.get('_pdf_ocr_text') or record.extracted_data.get('_raw_text') or ''
extracted_data = record.extracted_data
tenant_id = record.tenant_id

print(f"Record {record.id}:")
result = GSTINOwnershipClassifier.classify_gstins(raw_text, extracted_data, tenant_id)
print("\nClassification result:")
for k, v in result.items():
    print(f"  {k}: {repr(v)}")
