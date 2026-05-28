import os
import sys
import django
import uuid
import time

# Django setup
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from ocr_pipeline.models import InvoiceTempOCR
from core.redis_orchestrator import orchestrator

def run_test():
    print("=" * 60)
    print("E2E PIPELINE RUNNER & STABILITY VERIFIER")
    print("=" * 60)
    
    # 1. Get/create user and client
    User = get_user_model()
    # Find a branch or active user
    user = User.objects.filter(is_superuser=True).first() or User.objects.first()
    if not user:
        print("CRITICAL: No users found in database to run integration test.")
        return
        
    print(f"Using user: {user.username} | tenant: {user.branch_id}")
    
    client = APIClient()
    client.force_authenticate(user=user)
    
    # Let's verify files
    pdf_path = os.path.normpath(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "temp_load_test", "mock_5_dcc81a47.pdf"))
    if not os.path.exists(pdf_path):
        print(f"CRITICAL: {pdf_path} does not exist!")
        return
            
    print(f"Reading test file: {pdf_path}")
    
    # 2. Call POST upload API
    session_id = str(uuid.uuid4())
    print(f"Generated upload session: {session_id}")
    
    with open(pdf_path, 'rb') as f:
        response = client.post(
            '/api/ocr-staging/',
            {
                'files': [f],
                'upload_session_id': session_id,
                'voucher_type': 'PURCHASE'
            },
            format='multipart'
        )
        
    print(f"API Response status code: {response.status_code}")
    print(f"API Response data: {response.data}")
    
    if response.status_code not in (200, 202):
        print("Upload failed!")
        return
        
    job_id = response.data.get('job_id')
    print(f"Spawned job: {job_id}")
    
    # 3. Monitor polling endpoint
    print("\nStarting Polling Loop...")
    start_time = time.time()
    max_wait = 90  # 90 seconds timeout
    
    while time.time() - start_time < max_wait:
        # Get the polling endpoint response
        poll_resp = client.get(
            f'/api/ocr-staging/?upload_session_id={session_id}'
        )
        print(f"[{round(time.time() - start_time, 1)}s] Polling response status: {poll_resp.status_code}")
        # Print is_processing, status, number of rows etc.
        data = poll_resp.data
        if isinstance(data, dict):
            status = data.get('status')
            is_processing = (status == 'PROCESSING')
            records = data.get('records', []) or data.get('data', [])
            print(f"      status={status} is_processing={is_processing} records_count={len(records)}")
            
            # Print individual records statuses
            db_records = InvoiceTempOCR.objects.filter(upload_session_id=session_id)
            print(f"      DB records status: {[{'id': r.id, 'status': r.status, 'validation_status': r.validation_status} for r in db_records]}")
            
            if not is_processing:
                print("Polling complete! status is terminal.")
                break
        else:
            print(f"      Data is list or other: {str(data)[:200]}")
            
        time.sleep(3)
    else:
        print("TIMEOUT REACHED! Indefinite hang or processing stalled.")
        
    print("=" * 60)

if __name__ == '__main__':
    run_test()
