import os
import django
import json
import sys

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot

def capture_staging():
    print("--- RECENT STAGING RECORDS ---")
    records = InvoiceTempOCR.objects.all().order_by('-id')[:10]
    for r in records:
        print(f"ID: {r.id}, Session: {r.upload_session_id}, Status: {r.status}")
        print(f"  Keys: {list(r.extracted_data.keys()) if r.extracted_data else 'None'}")
        print("-" * 20)

    print("\n--- RECENT SNAPSHOTS ---")
    snapshots = FinalizedSnapshot.objects.all().order_by('-created_at')[:5]
    for s in snapshots:
        print(f"ID: {s.id}, Session: {s.session_id}, Count: {s.invoice_count}")
        if s.snapshot_json:
            invoices = s.snapshot_json.get('invoices', [])
            print(f"  Invoice Count: {len(invoices)}")
            if invoices:
                print(f"  First Invoice: {json.dumps(invoices[0], indent=2)[:200]}...")
        print("-" * 20)

if __name__ == "__main__":
    capture_staging()
