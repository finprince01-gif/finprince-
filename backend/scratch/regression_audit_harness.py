# -*- coding: utf-8 -*-
import os
import sys
import django
import uuid
import time
import gzip
import json
import traceback
from collections import defaultdict

# Setup Django environment
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

import fitz  # PyMuPDF
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate
from ocr_pipeline.views import CleanOCRStagingView
from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult, FinalizedSnapshot, InvoiceTempOCR
from core.storage import StorageService

def run_pdf_inventory(pdf_folder):
    print("Gathering PDF Inventory...")
    files = [f for f in os.listdir(pdf_folder) if f.lower().endswith(".pdf")]
    inventory = []
    
    for f in sorted(files):
        path = os.path.join(pdf_folder, f)
        size_bytes = os.path.getsize(path)
        try:
            doc = fitz.open(path)
            pages = doc.page_count
            doc.close()
        except Exception as e:
            pages = 0
            print(f"Error reading pages of {f}: {e}")
            
        inventory.append({
            "file_name": f,
            "page_count": pages,
            "file_size": size_bytes,
            "path": path
        })
        
    print(f"Discovered {len(inventory)} PDFs.")
    return inventory

def count_logs(session_id, record_id):
    """Scan log files in backend/logs/ for specific session/record trace identifiers."""
    counts = {
        "group_invoices": 0,      # [FORENSIC GROUP] or [GROUPING_START]
        "should_merge": 0,        # [GROUPING_GSTIN_COMPARE] or [CANONICAL_MATCH_MERGE]
        "classify_page": 0,       # [PAGE_ROLE_DECISION]
        "merge_group": 0,         # [FORENSIC_PRE_MERGE] or [MULTIPAGE_MERGE_APPLIED]
        "deduplicate_items": 0,   # [FORENSIC_PRE_DEDUPE] or [ITEM_DEDUPE_GUARD]
        "assemble_multi_page": 0, # [PIPELINE_STAGE_ENTER] stage=ASSEMBLY
        "finalize_worker": 0      # [WORKER_BOOT_START] role=FINALIZE
    }
    
    # Files to scan
    log_files = ["logs/cluster_restart.log", "logs/assembly.log", "logs/ai.log", "logs/finalize.log", "logs/debug.log"]
    seen_lines = set() # Avoid double counting across log files if they replicate
    
    for log_name in log_files:
        path = os.path.join(parent_dir, log_name)
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    # Is it related to our session or record?
                    if (str(session_id) in line) or (record_id and str(record_id) in line):
                        # Avoid duplicate counting
                        norm_line = line.strip()
                        if norm_line in seen_lines:
                            continue
                        seen_lines.add(norm_line)
                        
                        if "[FORENSIC GROUP]" in line or "[GROUPING_START]" in line:
                            counts["group_invoices"] += 1
                        if "[GROUPING_GSTIN_COMPARE]" in line or "[CANONICAL_MATCH_MERGE]" in line:
                            counts["should_merge"] += 1
                        if "[PAGE_ROLE_DECISION]" in line:
                            counts["classify_page"] += 1
                        if "[FORENSIC_PRE_MERGE]" in line or "[MULTIPAGE_MERGE_APPLIED]" in line:
                            counts["merge_group"] += 1
                        if "[FORENSIC_PRE_DEDUPE]" in line or "[ITEM_DEDUPE_GUARD]" in line:
                            counts["deduplicate_items"] += 1
                        if "[PIPELINE_STAGE_ENTER] stage=ASSEMBLY" in line:
                            counts["assemble_multi_page"] += 1
                        if "role=FINALIZE" in line or "role=finalize" in line:
                            counts["finalize_worker"] += 1
        except Exception as e:
            print(f"Error reading log file {log_name}: {e}")
            
    return counts

def run_regression_audit():
    pdf_folder = r"C:\Users\ulaganathan\Downloads\New folder (2)"
    inventory = run_pdf_inventory(pdf_folder)
    
    user = get_user_model().objects.get(username='admin')
    
    # Results dictionary
    audit_results = {}
    
    # Loop over 3 runs
    for run_idx in [1, 2, 3]:
        print(f"\n==========================================")
        print(f"STARTING REGRESSION AUDIT RUN {run_idx}/3")
        print(f"==========================================")
        
        run_records = []
        
        # 1. Dispatch uploads sequentially (very fast, no network overhead)
        for idx, item in enumerate(inventory):
            pdf_name = item["file_name"]
            pdf_path = item["path"]
            
            client = APIClient()
            client.force_authenticate(user=user)
            
            # Create a unique session ID
            session_id = f"audit_run_{run_idx}_{uuid.uuid4().hex[:6]}_{pdf_name.replace('.', '_')}"
            
            print(f"  [{idx+1}/{len(inventory)}] Uploading {pdf_name} (Session: {session_id})...")
            
            try:
                with open(pdf_path, 'rb') as f:
                    response = client.post(
                        '/api/ocr-staging/',
                        {
                            'files': f,
                            'upload_session_id': session_id,
                            'voucher_type': 'PURCHASE',
                            'upload_type': 'LIVE'
                        },
                        format='multipart'
                    )
                if response.status_code not in (200, 202):
                    print(f"    ERROR: HTTP {response.status_code} - {response.data}")
                    continue
                    
                # Find the record created
                db_rec = None
                for _ in range(20):
                    db_rec = InvoiceTempOCR.objects.filter(upload_session_id=session_id).first()
                    if db_rec:
                        break
                    time.sleep(0.1)
                    
                if not db_rec:
                    print(f"    ERROR: Record not created in DB for session {session_id}")
                    continue
                    
                run_records.append({
                    "file_name": pdf_name,
                    "session_id": session_id,
                    "record_id": db_rec.id,
                    "status": "PROCESSING",
                    "terminal": False
                })
            except Exception as e:
                print(f"    EXCEPTION during upload: {e}")
                
        # 2. Poll all records in parallel
        print(f"\nPolling {len(run_records)} records for terminal consistency...")
        start_time = time.time()
        timeout = 180 # 3 minutes max
        
        while (time.time() - start_time) < timeout:
            all_terminal = True
            for r in run_records:
                if r["terminal"]:
                    continue
                
                # Check status
                state = SessionFinalizationState.objects.filter(id=str(r["record_id"])).first()
                if state:
                    r["status"] = state.status
                    if state.terminal_consistency:
                        r["terminal"] = True
                    elif state.status == 'FAILED':
                        r["terminal"] = True
                    else:
                        all_terminal = False
                else:
                    all_terminal = False
                    
            # Print a quick summary of progress
            completed_count = sum(1 for r in run_records if r["terminal"])
            print(f"  [{int(time.time() - start_time)}s] Progress: {completed_count}/{len(run_records)} finished.")
            
            if all_terminal:
                print("All uploads converged to terminal state!")
                break
                
            time.sleep(4)
            
        # 3. Gather data for this run
        print("\nGathering DTOs and database state...")
        for r in run_records:
            session_id = r["session_id"]
            record_id = r["record_id"]
            pdf_name = r["file_name"]
            
            # Retrieve API DTO
            api_invoices = []
            try:
                factory = APIRequestFactory()
                request = factory.get(f'/api/ocr-staging/?upload_session_id={session_id}')
                force_authenticate(request, user=user)
                view_response = CleanOCRStagingView.as_view()(request)
                api_invoices = view_response.data.get('data', [])
            except Exception as e:
                print(f"  [WARN] Failed to fetch API DTO for {session_id}: {e}")
                
            # Retrieve Snapshot DTO
            snapshot_invoices = []
            try:
                snapshot = FinalizedSnapshot.objects.filter(session_id=session_id).order_by('-created_at').first()
                if snapshot and snapshot.s3_key:
                    compressed_bytes = StorageService().get_file(snapshot.s3_key)
                    snapshot_data = json.loads(gzip.decompress(compressed_bytes).decode('utf-8'))
                    snapshot_invoices = snapshot_data.get('data', [])
            except Exception as e:
                print(f"  [WARN] Failed to fetch Snapshot DTO for {session_id}: {e}")
                
            # Page Details
            pages_data = []
            try:
                pages = InvoicePageResult.objects.filter(record_id=record_id).order_by('page_number')
                for p in pages:
                    payload = p.canonical_payload or {}
                    pages_data.append({
                        "page_number": p.page_number,
                        "invoice_no": (payload.get('invoice_no') or '').strip().upper(),
                        "gstin": (payload.get('gstin') or '').strip().upper(),
                        "items_count": len(payload.get('items', [])),
                        "buyer_gstin": (payload.get('buyer_gstin') or '').strip().upper(),
                        "consignee_gstin": (payload.get('consignee_gstin') or '').strip().upper()
                    })
            except Exception as e:
                print(f"  [WARN] Failed to fetch pages details for {record_id}: {e}")
                
            # Log counts
            logs_telemetry = count_logs(session_id, record_id)
            
            # Save all information
            if pdf_name not in audit_results:
                audit_results[pdf_name] = {}
                
            audit_results[pdf_name][f"run_{run_idx}"] = {
                "session_id": session_id,
                "record_id": record_id,
                "status": r["status"],
                "api_invoices": api_invoices,
                "snapshot_invoices": snapshot_invoices,
                "pages": pages_data,
                "logs_telemetry": logs_telemetry
            }
            
    class DateTimeEncoder(json.JSONEncoder):
        def default(self, obj):
            import datetime
            if isinstance(obj, (datetime.datetime, datetime.date)):
                return obj.isoformat()
            try:
                return super().default(obj)
            except TypeError:
                return str(obj)

    # Save the raw output to a scratch JSON file for safe bookkeeping
    scratch_path = os.path.join(parent_dir, "scratch", "regression_raw_results.json")
    with open(scratch_path, "w") as f:
        json.dump(audit_results, f, indent=2, cls=DateTimeEncoder)
        
    print(f"\nRaw results saved to {scratch_path}")
    return audit_results, inventory

if __name__ == "__main__":
    run_regression_audit()
