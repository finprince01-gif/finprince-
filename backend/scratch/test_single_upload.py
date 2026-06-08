import os
import sys
import django
import uuid
import time

# Setup Django environment
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from ocr_pipeline.models import SessionFinalizationState, InvoiceTempOCR

def test_upload(pdf_path):
    user = get_user_model().objects.get(username='admin')
    client = APIClient()
    client.force_authenticate(user=user)
    
    upload_session_id = f"test_session_{uuid.uuid4().hex[:8]}"
    print(f"Uploading file: {pdf_path} with session: {upload_session_id}")
    
    start_time = time.time()
    with open(pdf_path, 'rb') as f:
        response = client.post(
            '/api/ocr-staging/',
            {
                'files': f,
                'upload_session_id': upload_session_id,
                'voucher_type': 'PURCHASE',
                'upload_type': 'LIVE'
            },
            format='multipart'
        )
        
    if response.status_code not in (200, 202):
        print(f"FAILED to upload: {response.status_code} - {response.data}")
        return
        
    print(f"Upload response: {response.data}")
    
    # Wait for record
    record = None
    for i in range(30):
        record = InvoiceTempOCR.objects.filter(upload_session_id=upload_session_id).first()
        if record:
            break
        time.sleep(0.5)
        
    if not record:
        print("Timeout waiting for record creation!")
        return
        
    print(f"Record created: {record.id}, current status: {record.status}")
    
    # Poll SessionFinalizationState
    print("Polling SessionFinalizationState.terminal_consistency...")
    for i in range(120):
        state = SessionFinalizationState.objects.filter(id=str(record.id)).first()
        if state:
            print(f"  [{i}s] status={state.status} terminal_consistency={state.terminal_consistency}")
            if state.terminal_consistency:
                print(f"SUCCESS: completed in {time.time() - start_time:.2f} seconds!")
                return
            if state.status == 'FAILED':
                print("FAILED: finalization state marked as failed.")
                return
        else:
            print(f"  [{i}s] No finalization state record yet.")
        time.sleep(1)
        
    print("Timeout waiting for terminal consistency!")

if __name__ == "__main__":
    pdf_path = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0006.pdf"
    test_upload(pdf_path)
