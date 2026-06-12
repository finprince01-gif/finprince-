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

def view_raw_pages():
    pages = InvoicePageResult.objects.filter(record_id=1007118).order_by('page_number')
    print(f"Found {len(pages)} pages for record 1007118:")
    for p in pages:
        print(f"\n--- PAGE {p.page_number} ---")
        print(json.dumps(p.canonical_payload, indent=2))

if __name__ == "__main__":
    view_raw_pages()
