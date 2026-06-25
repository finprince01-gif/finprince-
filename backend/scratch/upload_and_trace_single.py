import os
import sys
import json
import time
import uuid
import requests
import django
from datetime import datetime, timezone

# Add backend to path for Django
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult, PoisonDocument, SessionFinalizationState
from core.redis_orchestrator import orchestrator
from core.sqs import queue_service

API_BASE = "http://localhost:8000"
USER = "admin"
EMAIL = "admin@budstech.com"
PASS = "admin123"
FILE_PATH = r"C:\Users\ulaganathan\Downloads\New folder (2)\stress_test_15pages.pdf"


def main():
    print("=== STARTING SINGLE INVOICE FORENSIC VALIDATION ===")
    
    # 1. Capture Pre-Test State
    print("\n[1] Capturing Pre-Test Metrics...")
    import redis as redis_lib
    r = redis_lib.Redis(host="localhost", port=6379, db=0, decode_responses=True)
    
    pre_keys = r.dbsize()
    pre_active_slots = len(list(r.scan_iter("assembly:*:active_slots")))
    pre_ai_queue = queue_service.get_queue_depth('ai')
    pre_ingestion_queue = queue_service.get_queue_depth('ingestion')
    print(f"  Redis Keys: {pre_keys}")
    print(f"  Redis Active Slots: {pre_active_slots}")
    print(f"  SQS Ingestion Depth: {pre_ingestion_queue}")
    print(f"  SQS AI Depth: {pre_ai_queue}")
    
    # 2. Authenticate
    print("\n[2] Authenticating...")
    session = requests.Session()
    login_url = f"{API_BASE}/api/auth/login/"
    resp = session.post(login_url, json={"username": USER, "email": EMAIL, "password": PASS}, timeout=30)
    if resp.status_code != 200:
        print(f"Authentication failed: {resp.status_code} - {resp.text}")
        return
    token = resp.json().get("access")
    session.headers.update({"Authorization": f"Bearer {token}"})
    print("  Authenticated successfully!")

    # 3. Upload File
    upload_session_id = str(uuid.uuid4())
    print(f"\n[3] Uploading file with session={upload_session_id}...")
    
    url = f"{API_BASE}/api/ocr-staging/"
    with open(FILE_PATH, "rb") as f:
        files = [("files", (os.path.basename(FILE_PATH), f, "application/pdf"))]
        data = {
            "voucher_type": "PURCHASE",
            "upload_type": "SPRINT3_VALIDATION",
            "upload_session_id": upload_session_id,
        }

        resp = session.post(url, files=files, data=data, timeout=120)
    
    if resp.status_code not in (200, 201, 202):
        print(f"Upload failed: {resp.status_code} - {resp.text}")
        return
        
    res = resp.json()
    job_id = res.get("job_id") or res.get("id")
    record_id = res.get("record_id") or res.get("id")
    print(f"  Upload Success! record_id={record_id} | job_id={job_id} | session_id={upload_session_id}")

    # 4. Polling Lifecycle Until Stalled/Terminal
    print("\n[4] Polling Job Status...")
    status_url = f"{API_BASE}/api/ocr-job-status/{job_id}/"
    
    start_time = time.time()
    # Wait up to 300 seconds
    deadline = start_time + 400
    
    last_status = "UNKNOWN"
    while time.time() < deadline:
        try:
            r_status = session.get(status_url, timeout=10)
            if r_status.status_code == 200:
                data = r_status.json()
                last_status = data.get("status", "UNKNOWN").upper()
                progress = data.get("progress", 0)
                processed = data.get("processed", 0)
                failed = data.get("failed", 0)
                total = data.get("total", 0)
                completed = data.get("completed", False)
                
                print(f"  [{time.time()-start_time:.1f}s] status={last_status} progress={progress}% processed={processed} failed={failed} total={total} completed={completed}")
                
                # Check DB directly
                temp_rec = InvoiceTempOCR.objects.filter(id=record_id).first()
                if temp_rec:
                    print(f"    [DB] Record Status: {temp_rec.status} | Processed: {temp_rec.processed} | Invoice No: {temp_rec.supplier_invoice_no}")
                
                # Query Redis keys for this session
                active_slots = r.zcard(f"assembly:{record_id}:active_slots") or 0
                page_states = r.hgetall(f"assembly:{record_id}:page_states") or {}
                print(f"    [Redis] Active Slots: {active_slots} | Page States: {page_states}")
                
                # SQS Depth check
                ai_depth = queue_service.get_queue_depth('ai')
                ing_depth = queue_service.get_queue_depth('ingestion')
                print(f"    [SQS] Ingestion: {ing_depth} | AI: {ai_depth}")
                
                # Stop if it is completed or if it is stuck for too long
                if completed or last_status in ("COMPLETED", "FAILED", "SUCCESS_WITH_WARNINGS", "PARTIAL_FAILED"):
                    print("  Terminal status reached!")
                    break
            else:
                print(f"  Status API returned code {r_status.status_code}: {r_status.text}")
        except Exception as e:
            print(f"  Error polling status: {e}")
            
        time.sleep(10)
        
    print("\n[5] Capturing Post-Test State...")
    print(f"Duration: {time.time() - start_time:.2f}s")
    
    # Check PoisonDocuments
    poisons = PoisonDocument.objects.filter(record_id=str(record_id))
    print(f"Poison Documents for {record_id}: {poisons.count()}")
    for pd in poisons:
        print(f"  Poison ID: {pd.id} | Queue: {pd.queue_name} | Retry: {pd.retry_count} | Error: {pd.error_trace}")
        
    # Check Page Results
    results = InvoicePageResult.objects.filter(record_id=str(record_id)).order_by('page_number')
    print(f"Page Results in DB: {results.count()}")
    for pr in results:
        print(f"  Page {pr.page_number} | Failed: {pr.is_failed} | Saved At: {pr.created_at}")
        
    # Check SessionFinalizationState
    sfs = SessionFinalizationState.objects.filter(id=str(record_id)).first()
    if sfs:
        print(f"SessionFinalizationState: expected={sfs.expected_pages} completed={sfs.completed_pages} failed={sfs.failed_pages} ingestion_complete={sfs.ingestion_complete} ai_complete={sfs.ai_complete}")

if __name__ == "__main__":
    main()
