import os
import django
import json
import sys

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot, SessionFinalizationState

def check_session(session_id):
    print(f"--- SESSION {session_id} ---")
    records = InvoiceTempOCR.objects.filter(upload_session_id=session_id)
    print(f"Records Found: {records.count()}")
    for r in records:
        print(f"  ID: {r.id}, Status: {r.status}, Validation: {r.validation_status}")
        state = SessionFinalizationState.objects.filter(id=str(r.id)).first()
        if state:
            print(f"    State: expected={state.total_pages_expected}, completed={state.total_pages_completed}")
        else:
            print(f"    State: NOT FOUND")

    snapshots = FinalizedSnapshot.objects.filter(session_id=session_id)
    print(f"Snapshots Found: {snapshots.count()}")
    for s in snapshots:
        print(f"  ID: {s.id}, Count: {s.invoice_count}")

if __name__ == "__main__":
    # Use the session ID from previous run
    check_session("1778348099844")
