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

from ocr_pipeline.models import InvoicePageResult

def inspect_pages():
    pages = InvoicePageResult.objects.filter(record_id=1007120).order_by('page_number')
    for p in pages:
        payload = p.canonical_payload
        header = payload.get("header", {})
        inv_no = header.get("invoice_no")
        if inv_no == "26001008" or "1008" in str(inv_no):
            print(f"\n--- Page {p.page_number} (Invoice: {inv_no}) ---")
            print(json.dumps(payload, indent=2))

if __name__ == "__main__":
    inspect_pages()
