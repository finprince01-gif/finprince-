import os
import sys
import django
import logging

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

logging.basicConfig(level=logging.INFO)

from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.pipeline import validate_and_process

record_id = 1004955
print(f"Loading record {record_id}...")
try:
    record = InvoiceTempOCR.objects.get(id=record_id)
    print(f"Record found! Status={record.status}, Validation Status={record.validation_status}")
    print("Executing validate_and_process(record, auto_save=True)...")
    res = validate_and_process(record, auto_save=True)
    print(f"Result: {res}")
except Exception as e:
    import traceback
    traceback.print_exc()
