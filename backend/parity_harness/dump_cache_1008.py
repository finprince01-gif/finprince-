import os
import sys
import json
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import AICache

def dump_cache():
    entries = AICache.objects.all()
    for entry in entries:
        payload = entry.payload
        header = payload.get("header", {})
        inv_no = header.get("invoice_no")
        if inv_no == "26001008":
            print(f"Hash: {entry.key_hash}, hits: {entry.hits}")
            print(json.dumps(payload, indent=2))
            print("="*60)

if __name__ == "__main__":
    dump_cache()
