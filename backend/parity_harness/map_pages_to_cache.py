import os
import sys
import hashlib
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoicePageResult, AICache

def map_pages_to_cache():
    pages = InvoicePageResult.objects.filter(record_id=1007120).order_by('page_number')
    for p in pages:
        payload = p.canonical_payload
        ocr_text = payload.get("_pdf_ocr_text") or ""
        key_hash = hashlib.sha256(ocr_text.encode()).hexdigest()
        
        cache_entry = AICache.objects.filter(key_hash=key_hash).first()
        if cache_entry:
            c_header = cache_entry.payload.get("header", {})
            print(f"Page {p.page_number}: Hash={key_hash} -> CACHE HIT! Invoice={c_header.get('invoice_no')}, Vendor={c_header.get('vendor_name')}")
        else:
            print(f"Page {p.page_number}: Hash={key_hash} -> Cache Miss")

if __name__ == "__main__":
    map_pages_to_cache()
