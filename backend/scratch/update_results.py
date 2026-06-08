# -*- coding: utf-8 -*-
import os
import sys
import django
import json
import gzip

# Setup Django environment
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate
from ocr_pipeline.views import CleanOCRStagingView
from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult, FinalizedSnapshot, InvoiceTempOCR
from core.storage import StorageService

def update_results():
    raw_results_path = os.path.join(parent_dir, "scratch", "regression_raw_results.json")
    if not os.path.exists(raw_results_path):
        print("Raw results JSON not found.")
        return
        
    with open(raw_results_path, "r") as f:
        data = json.load(f)
        
    user = get_user_model().objects.get(username='admin')
    
    print("Updating raw results from current database state...")
    for filename, runs in data.items():
        for run_name in ["run_1", "run_2", "run_3"]:
            run_data = runs.get(run_name)
            if not run_data:
                continue
                
            record_id = run_data.get("record_id")
            session_id = run_data.get("session_id")
            
            # Re-check database state
            state = SessionFinalizationState.objects.filter(id=str(record_id)).first()
            if state:
                run_data["status"] = state.status
                print(f"  {filename} {run_name}: record={record_id} status={state.status} terminal_consistency={state.terminal_consistency}")
                
                # If it's finalized now, retrieve the DTOs
                if state.terminal_consistency or state.status == 'FINALIZED':
                    # Retrieve API DTO
                    try:
                        factory = APIRequestFactory()
                        request = factory.get(f'/api/ocr-staging/?upload_session_id={session_id}')
                        force_authenticate(request, user=user)
                        view_response = CleanOCRStagingView.as_view()(request)
                        api_invoices = view_response.data.get('data', [])
                        if api_invoices:
                            run_data["api_invoices"] = api_invoices
                    except Exception as e:
                        print(f"    Failed to fetch API DTO for {session_id}: {e}")
                        
                    # Retrieve Snapshot DTO
                    try:
                        snapshot = FinalizedSnapshot.objects.filter(session_id=session_id).order_by('-created_at').first()
                        if snapshot and snapshot.s3_key:
                            compressed_bytes = StorageService().get_file(snapshot.s3_key)
                            snapshot_data = json.loads(gzip.decompress(compressed_bytes).decode('utf-8'))
                            snapshot_invoices = snapshot_data.get('data', [])
                            if snapshot_invoices:
                                run_data["snapshot_invoices"] = snapshot_invoices
                    except Exception as e:
                        print(f"    Failed to fetch Snapshot DTO for {session_id}: {e}")
            else:
                print(f"  {filename} {run_name}: no SessionFinalizationState record found for id {record_id}")
                
    class DateTimeEncoder(json.JSONEncoder):
        def default(self, obj):
            import datetime
            if isinstance(obj, (datetime.datetime, datetime.date)):
                return obj.isoformat()
            try:
                return super().default(obj)
            except TypeError:
                return str(obj)

    with open(raw_results_path, "w") as f:
        json.dump(data, f, indent=2, cls=DateTimeEncoder)
        
    print("Database sync complete.")

if __name__ == "__main__":
    update_results()
