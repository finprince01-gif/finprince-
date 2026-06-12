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

def inspect_pages_brief():
    pages = InvoicePageResult.objects.filter(record_id=1007120).order_by('page_number')
    for p in pages:
        payload = p.canonical_payload
        header = payload.get("header", {})
        inv_no = header.get("invoice_no")
        items = payload.get("items", [])
        print(f"Page {p.page_number}: invoice_no={inv_no}, header_taxable={header.get('taxable_value')}, header_total={header.get('total_amount')}, item_count={len(items)}")
        for i, item in enumerate(items):
            print(f"  Item {i}: desc={item.get('description')}, qty={item.get('quantity')}, rate={item.get('rate')}, taxable={item.get('taxable_value')}, amount={item.get('amount')}")

if __name__ == "__main__":
    inspect_pages_brief()
