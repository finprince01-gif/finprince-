import os
import sys
import django
import json
import gzip

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import FinalizedSnapshot
from core.storage import StorageService

session_id = "931c131b-67ee-4b3b-9c5b-22d3f271b37f"
snapshot = FinalizedSnapshot.objects.filter(session_id=session_id).first()
if snapshot:
    compressed_bytes = StorageService().get_file(snapshot.s3_key)
    json_bytes = gzip.decompress(compressed_bytes)
    snap_data = json.loads(json_bytes.decode('utf-8'))
    
    data = snap_data.get('data', [])
    for idx, inv in enumerate(data):
        if inv.get('invoice_no') == '4216/25-26':
            print(f"\n--- Invoice {idx} ---")
            print(json.dumps(inv, indent=2))
