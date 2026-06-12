import os
import sys
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoiceTempOCR

rec = InvoiceTempOCR.objects.filter(id=1007120).first()
if rec:
    print(f"Record 1007120: status={rec.status}, validation_status={rec.validation_status}, validation_message={rec.validation_message}")
else:
    print("Record 1007120 not found.")
