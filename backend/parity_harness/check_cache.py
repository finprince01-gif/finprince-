import os
import sys
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import AICache

def check_cache():
    count = AICache.objects.count()
    print(f"Total AICache entries: {count}")
    for entry in AICache.objects.all()[:10]:
        payload = entry.payload
        header = payload.get("header", {})
        print(f"Hash: {entry.key_hash}, hits: {entry.hits}, invoice_no: {header.get('invoice_no')}, vendor: {header.get('vendor_name')}")

if __name__ == "__main__":
    check_cache()
