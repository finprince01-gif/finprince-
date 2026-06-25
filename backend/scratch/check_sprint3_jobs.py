import os
import sys
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from ocr_pipeline.models import OCRJob, OCRTask, InvoiceTempOCR, SessionFinalizationState, InvoicePageResult
from django.db.models import Count

print("=== ACTIVE JOBS IN SPRINT 3 RUN ===")
job_ids = [
    "400287bd-7bdf-4a1f-a417-93a568450f1a",
    "9a02e561-9265-4b57-ac37-13851842f96b"
]

for jid in job_ids:
    try:
        job = OCRJob.objects.get(id=jid)
        print(f"Job: {job.id}")
        print(f"  Status: {job.status}")
        print(f"  Processed Files: {job.processed_files}/{job.total_files}")
        print(f"  Processed Pages: {job.processed_pages}/{job.total_pages}")
        
        # Check task statuses under this job
        tasks = OCRTask.objects.filter(job_id=jid).values('status').annotate(count=Count('id'))
        print(f"  Tasks:")
        for t in tasks:
            print(f"    - {t['status']}: {t['count']}")
            
        # Get tasks details
        task_details = OCRTask.objects.filter(job_id=jid)
        for td in task_details[:5]:
            print(f"    Task ID: {td.id} | Status: {td.status} | File: {td.file_name} | Result ID: {td.result_id}")
            
    except OCRJob.DoesNotExist:
        print(f"Job {jid} does not exist in DB yet.")

print("\n=== RECENT SESSION FINALIZATIONS ===")
recent_sessions = SessionFinalizationState.objects.all().order_by('-created_at')[:5]
for s in recent_sessions:
    print(f"Session (Record ID): {s.id} | Status: {s.status} | Expected: {s.expected_pages} | Completed: {s.completed_pages} | AI complete: {s.ai_complete} | Ingestion complete: {s.ingestion_complete}")
    # Show page results under this record_id
    try:
        rid = int(s.id)
        pages = InvoicePageResult.objects.filter(record_id=rid).order_by('page_number')
        print(f"  Page Results (Count: {pages.count()}):")
        for p in pages:
            print(f"    - Page {p.page_number} | Session ID: {p.session_id} | Failed: {p.is_failed}")
    except ValueError:
        print(f"  (Session ID {s.id} is not an integer record ID)")
