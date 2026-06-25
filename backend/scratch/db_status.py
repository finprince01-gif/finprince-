import os
import sys
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from ocr_pipeline.models import OCRJob, OCRTask, InvoiceTempOCR, InvoicePageResult, SessionFinalizationState, PipelineEvent, PoisonDocument
from vouchers.models import InvoiceProcessingItem
from django.db.models import Count

print("=== PIPELINE RUN STATE ===")
jobs = OCRJob.objects.all().order_by('-created_at')[:5]
print(f"Total OCR Jobs in DB: {OCRJob.objects.count()}")
for j in jobs:
    print(f"Job: {j.id} | Status: {j.status} | Files: {j.processed_files}/{j.total_files} | Pages: {j.processed_pages}/{j.total_pages} | Created: {j.created_at}")

print("\n=== OCR TASKS ===")
tasks_by_status = OCRTask.objects.values('status').annotate(count=Count('id'))
for item in tasks_by_status:
    print(f"  Status: {item['status']} -> {item['count']}")

print("\n=== STAGING RECORDS (InvoiceTempOCR) ===")
ocr_by_status = InvoiceTempOCR.objects.values('status').annotate(count=Count('id'))
for item in ocr_by_status:
    print(f"  Status: {item['status']} -> {item['count']}")

print("\n=== PAGE RESULTS (InvoicePageResult) ===")
print(f"Total Page Results: {InvoicePageResult.objects.count()}")

print("\n=== SESSION FINALIZATION STATES ===")
sessions = SessionFinalizationState.objects.all().order_by('-created_at')[:5]
for s in sessions:
    print(f"Session: {s.id} | Status: {s.status} | Expected Pages: {s.expected_pages} | Completed Pages: {s.completed_pages} | Ingestion Complete: {s.ingestion_complete} | AI Complete: {s.ai_complete} | Export Complete: {s.export_complete} | Materialization Complete: {s.materialization_complete}")

print("\n=== POISON DOCUMENTS ===")
print(f"Total Poison Documents: {PoisonDocument.objects.count()}")

print("\n=== PIPELINE EVENTS ===")
events_by_status = PipelineEvent.objects.values('status').annotate(count=Count('id'))
for item in events_by_status:
    print(f"  Status: {item['status']} -> {item['count']}")
