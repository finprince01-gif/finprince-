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

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult
from ocr_pipeline.pipeline import assemble_multi_page_record

def trace_merge():
    # Get the latest record from our test
    record = InvoiceTempOCR.objects.filter(file_path__icontains="sample_2.pdf").order_by("-id").first()
    if not record:
        print("Record not found.")
        return
    print(f"Tracing record ID: {record.id}")
    
    # Let's inspect the pages before assembly
    pages = list(InvoicePageResult.objects.filter(record_id=record.id))
    print(f"Found {len(pages)} pages in DB:")
    for p in pages:
        print(f"  Page {p.page_number}: payload keys={list(p.canonical_payload.keys())}")
        print(f"    items={len(p.canonical_payload.get('items', []))}")
        print(f"    total_taxable_value={p.canonical_payload.get('total_taxable_value')}")
        print(f"    total_amount={p.canonical_payload.get('total_amount')}")
        print(f"    total_invoice_value={p.canonical_payload.get('total_invoice_value')}")

    # Now let's run assembly synchronously
    print("\nRunning assemble_multi_page_record(record)...")
    res = assemble_multi_page_record(record)
    print(f"Assembly Result: {res}")

if __name__ == "__main__":
    trace_merge()
