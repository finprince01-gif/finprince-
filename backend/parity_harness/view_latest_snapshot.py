import os
import sys
import json
import gzip
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import FinalizedSnapshot
from core.storage import StorageService

def view_latest():
    snapshot = FinalizedSnapshot.objects.order_by('-created_at').first()
    if not snapshot:
        print("No snapshots found.")
        return
    print(f"Latest Snapshot: ID={snapshot.id}, Session={snapshot.session_id}, Key={snapshot.s3_key}, Invoices={snapshot.invoice_count}")
    
    try:
        compressed_bytes = StorageService().get_file(snapshot.s3_key)
        decompressed = gzip.decompress(compressed_bytes)
        payload = json.loads(decompressed)
        print(json.dumps(payload, indent=2))
    except Exception as e:
        print(f"Error reading snapshot file: {e}")

if __name__ == "__main__":
    view_latest()
