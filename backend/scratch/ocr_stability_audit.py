import os
import sys
import time
import uuid
import requests
import django
import json
import gzip

# Setup Django
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult, FinalizedSnapshot, InvoiceTempOCR
from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from core.storage import StorageService

pdf_path = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0005.pdf"
url = "http://localhost:8000/api/bulk-upload/"

runs_data = []

print("Starting 10 independent runs of target PDF: {}".format(pdf_path))

for run_idx in range(1, 11):
    upload_session_id = str(uuid.uuid4())
    print("\n--- RUN {}/10 | Session ID: {} ---".format(run_idx, upload_session_id))
    
    files = {'files': open(pdf_path, 'rb')}
    data = {
        'upload_session_id': upload_session_id,
        'voucher_type': 'Purchase',
        'upload_type': 'LIVE'
    }
    
    start_time = time.time()
    response = requests.post(url, files=files, data=data)
    if response.status_code != 200:
        print("Upload failed for run {}, status={}, response={}".format(run_idx, response.status_code, response.text))
        continue
        
    job_id = response.json()['job_id']
    print("Triggered Job ID: {}".format(job_id))
    
    # Wait for the record ID to be resolved
    record_id = None
    for _ in range(30):
        time.sleep(1)
        item = InvoiceProcessingItem.objects.filter(job_id=job_id).first()
        if item and item.staging_record_id:
            record_id = item.staging_record_id
            break
    
    if not record_id:
        print("Could not resolve staging record ID for job {}, aborting run.".format(job_id))
        continue
        
    print("Staging Record ID: {}".format(record_id))
    
    # Wait for terminal state
    completed = False
    timeout = 180  # 3 minutes per run max
    while (time.time() - start_time) < timeout:
        # Check job status
        job = BulkInvoiceJob.objects.filter(id=job_id).first()
        barrier = SessionFinalizationState.objects.filter(id=str(record_id)).first()
        
        if (job and job.status in ['COMPLETED', 'FAILED']) or (barrier and (barrier.snapshot_created or barrier.status in ['SUCCESS', 'FAILED'])):
            print("Run {} reached terminal state. Status: Job={}, Barrier={}".format(run_idx, job.status if job else 'N/A', barrier.status if barrier else 'N/A'))
            completed = True
            break
        time.sleep(2)
        
    duration = time.time() - start_time
    print("Run {} completed in {:.2f} seconds".format(run_idx, duration))
    
    # Gather DB results for this run
    barrier = SessionFinalizationState.objects.filter(id=str(record_id)).first()
    db_pages = list(InvoicePageResult.objects.filter(record_id=record_id).order_by('page_number'))
    temp_records = list(InvoiceTempOCR.objects.filter(upload_session_id=upload_session_id).order_by('id'))
    snapshot_record = FinalizedSnapshot.objects.filter(session_id=upload_session_id).first()
    
    # Fetch snapshot from S3 if it exists
    snapshot_data = None
    if snapshot_record and snapshot_record.s3_key:
        try:
            content = StorageService().get_file(snapshot_record.s3_key)
            if snapshot_record.s3_key.endswith('.gz'):
                content = gzip.decompress(content)
            snapshot_data = json.loads(content)
        except Exception as e:
            print("Error retrieving snapshot from S3: {}".format(e))

    # Compile run information
    run_info = {
        "run_number": run_idx,
        "session_id": upload_session_id,
        "job_id": job_id,
        "record_id": record_id,
        "duration_seconds": duration,
        "barrier_status": barrier.status if barrier else None,
        "snapshot_created": barrier.snapshot_created if barrier else False,
        "pages": []
    }
    
    # Capture page-by-page OCR extraction before normalization
    for p in db_pages:
        payload = p.canonical_payload or {}
        p_info = {
            "page_number": p.page_number,
            "raw": {
                "invoice_no": payload.get("invoice_no"),
                "gstin": payload.get("gstin"),
                "vendor_name": payload.get("vendor_name"),
                "invoice_date": payload.get("invoice_date")
            }
        }
        run_info["pages"].append(p_info)
        
    # Capture grouped records (InvoiceTempOCR)
    run_info["grouped_records"] = []
    for r in temp_records:
        r_info = {
            "id": r.id,
            "invoice_no": r.supplier_invoice_no,
            "gstin": r.gstin,
            "branch": r.branch,
            "is_primary": r.is_primary,
            "group_id": r.group_id,
            "status": r.status
        }
        run_info["grouped_records"].append(r_info)
        
    # Capture snapshot details
    run_info["snapshot"] = {
        "id": str(snapshot_record.id) if snapshot_record else None,
        "invoice_count": snapshot_record.invoice_count if snapshot_record else 0,
        "s3_key": snapshot_record.s3_key if snapshot_record else None,
        "invoices": []
    }
    
    if snapshot_data and "data" in snapshot_data:
        for inv in snapshot_data["data"]:
            inv_info = {
                "invoice_no": inv.get("invoice_no"),
                "gstin": inv.get("gstin"),
                "invoice_date": inv.get("invoice_date"),
                "item_count": len(inv.get("items", []))
            }
            run_info["snapshot"]["invoices"].append(inv_info)
            
    runs_data.append(run_info)
    
    # Save partial results after each run
    with open("scratch/audit_results.json", "w") as f:
        json.dump(runs_data, f, indent=4)

print("\nAll 10 runs completed and results saved to scratch/audit_results.json")
