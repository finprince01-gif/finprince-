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

def print_keys(session_id):
    snapshot = FinalizedSnapshot.objects.filter(session_id=session_id).first()
    if not snapshot:
        print("No snapshot")
        return
    compressed_bytes = StorageService().get_file(snapshot.s3_key)
    decompressed = gzip.decompress(compressed_bytes)
    payload = json.loads(decompressed)
    print("Payload type:", type(payload))
    if isinstance(payload, dict):
        print("Keys:", list(payload.keys()))
        for k, v in payload.items():
            print(f"  {k}: type={type(v)}")
    elif isinstance(payload, list):
        print("List length:", len(payload))
        if len(payload) > 0:
            print("First item keys:", list(payload[0].keys()))

if __name__ == "__main__":
    print_keys("forensic-sample_1-1781246142")
