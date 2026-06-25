import os
import sys
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, OCRTask, OCRJob
from django.utils import timezone

session_id = "c1311ebd-e123-411b-91fb-7451ba3a0705"

print(f"=== CHECKING UPLOADS FOR SESSION {session_id} ===")
count = InvoiceTempOCR.objects.filter(upload_session_id=session_id).count()
print(f"Uploaded files in invoice_ocr_temp: {count}")

records = InvoiceTempOCR.objects.filter(upload_session_id=session_id)
for r in records:
    print(f"  File: {r.file_path} | Status: {r.status} | Voucher Type: {r.voucher_type}")

print(f"\nTotal OCR Jobs created since 15:35: " 
      f"{OCRJob.objects.filter(created_at__gte=timezone.now().replace(hour=10, minute=5, second=0)).count()}")
      
recent_jobs = OCRJob.objects.filter(created_at__gte=timezone.now().replace(hour=10, minute=5, second=0)).order_by('-created_at')
for j in recent_jobs:
    print(f"  Job: {j.id} | Status: {j.status} | Files: {j.processed_files}/{j.total_files} | Created: {j.created_at}")
