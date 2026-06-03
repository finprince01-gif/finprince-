import os
import sys
import django

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoicePageResult

for page in InvoicePageResult.objects.filter(record_id="1004965").order_by('page_number'):
    payload = page.canonical_payload or {}
    print(f"Page {page.page_number} keys: {sorted(list(payload.keys()))}")
    # Print the values of any underscore keys
    underscore_keys = [k for k in payload.keys() if k.startswith("_")]
    if underscore_keys:
        print(f"  Underscore keys and values: { {k: payload[k] for k in underscore_keys} }")
