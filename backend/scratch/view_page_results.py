import os
import sys
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, OCRTask, InvoicePageResult, PipelineEvent, SessionFinalizationState
from django.utils import timezone

session_id = "c1311ebd-e123-411b-91fb-7451ba3a0705"
job_id = "400287bd-7bdf-4a1f-a417-93a568450f1a"

print("=== OCR TASKS ===")
tasks = OCRTask.objects.filter(job_id=job_id)
print(f"Tasks for job {job_id}: {tasks.count()}")
for t in tasks:
    print(f"  Task: {t.id} | File: {t.file_name} | Status: {t.status} | Result ID: {t.result_id}")

print("\n=== PAGE RESULTS ===")
pages = InvoicePageResult.objects.all().order_by('-created_at')[:20]
print(f"Total Page Results in DB: {InvoicePageResult.objects.count()}")
for p in pages:
    print(f"  Record: {p.record_id} | Page: {p.page_number} | Session: {p.session_id} | Created: {p.created_at}")

print("\n=== RECENT PIPELINE EVENTS ===")
events = PipelineEvent.objects.all().order_by('-created_at')[:10]
for e in events:
    print(f"  Event: {e.id} | Record: {e.record_id} | Status: {e.status} | Workflow: {e.workflow_id} | Sequence: {e.event_sequence} | Created: {e.created_at}")
