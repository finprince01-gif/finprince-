import os
import sys
import time
import uuid
import requests
import django

# Setup Django
import sys
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult
from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from django.db import connection

pdf_path = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0005.pdf"
upload_session_id = str(uuid.uuid4())
print(f"Target PDF: {pdf_path}")
print(f"Generated Session ID: {upload_session_id}")

# Get current file size of logs/debug.log to start tailing from the end
log_path = "logs/debug.log"
start_offset = 0
if os.path.exists(log_path):
    start_offset = os.path.getsize(log_path)
print(f"Log start offset: {start_offset} bytes")

# Trigger the upload
url = "http://localhost:8000/api/bulk-upload/"
files = {'files': open(pdf_path, 'rb')}
data = {
    'upload_session_id': upload_session_id,
    'voucher_type': 'Purchase',
    'upload_type': 'LIVE'
}

print("Sending POST request to trigger upload...")
response = requests.post(url, files=files, data=data)
print(f"Response Status: {response.status_code}")
print(f"Response JSON: {response.json()}")

if response.status_code != 200:
    print("Upload failed, aborting.")
    sys.exit(1)

job_id = response.json()['job_id']
print(f"Triggered Job ID: {job_id}")

# Find record ID linked to this job/session
time.sleep(2)
item = InvoiceProcessingItem.objects.filter(job_id=job_id).first()
record_id = item.staging_record_id if item else "unknown"
print(f"Linked Staging Record ID: {record_id}")

# Tailing function
def poll_logs(offset, session_id, record_id):
    if not os.path.exists(log_path):
        return offset
    
    new_offset = offset
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        f.seek(offset)
        lines = f.readlines()
        new_offset = f.tell()
        
        for line in lines:
            # Highlight interesting tags and filter for our session/record
            if session_id in line or str(record_id) in line:
                print(line.strip())
                
    return new_offset

# Poll loops
print("\n=== STARTING LIVE TRACE ===")
completed = False
start_time = time.time()
timeout = 300  # 5 minutes timeout

log_offset = start_offset

while not completed and (time.time() - start_time) < timeout:
    time.sleep(1)
    
    # 1. Tail log file
    log_offset = poll_logs(log_offset, upload_session_id, record_id)
    
    # 2. Check Job status
    job = BulkInvoiceJob.objects.filter(id=job_id).first()
    if job and job.status in ['COMPLETED', 'FAILED']:
        print(f"\n[JOB_TERMINAL] Job {job_id} reached status {job.status}")
        completed = True
        
    # Check if finalization state has snapshot_created or failed
    if record_id != "unknown":
        barrier = SessionFinalizationState.objects.filter(id=str(record_id)).first()
        if barrier and (barrier.snapshot_created or barrier.status in ['SUCCESS', 'FAILED']):
            print(f"\n[BARRIER_TERMINAL] Barrier {record_id} status={barrier.status} snapshot_created={barrier.snapshot_created}")
            completed = True

# Read final database states
print("\n=== FINAL DATABASE STATE ===")
if record_id != "unknown":
    barrier = SessionFinalizationState.objects.filter(id=str(record_id)).first()
    if barrier:
        print(f"SessionFinalizationState ({record_id}):")
        print(f"  expected_pages: {barrier.expected_pages}")
        print(f"  completed_pages: {barrier.completed_pages}")
        print(f"  failed_pages: {barrier.failed_pages}")
        print(f"  ai_completed_pages: {barrier.ai_completed_pages}")
        print(f"  total_pages_completed: {barrier.total_pages_completed}")
        print(f"  status: {barrier.status}")
        print(f"  snapshot_created: {barrier.snapshot_created}")
    else:
        print(f"SessionFinalizationState for record {record_id} does not exist!")
        
    pages = InvoicePageResult.objects.filter(record_id=record_id).order_by('page_number')
    print(f"\nInvoicePageResult records count: {pages.count()}")
    for page in pages:
        print(f"  Page {page.page_number} | is_failed: {page.is_failed} | counted_in_barrier: {page.counted_in_barrier} | payload keys: {list(page.canonical_payload.keys()) if page.canonical_payload else None}")
else:
    print("No staging record ID resolved.")
