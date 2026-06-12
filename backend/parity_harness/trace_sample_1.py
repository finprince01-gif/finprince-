import os
import sys
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult
from ocr_pipeline.normalize import get_canonical_export_record

def trace_sample_1():
    target_id = 1007165
    print(f"Tracing record ID: {target_id}")
    pages = list(InvoicePageResult.objects.filter(record_id=target_id).order_by("page_number"))
    print(f"Found {len(pages)} pages.")
    
    for p in pages:
        p_payload = p.canonical_payload
        normalized = get_canonical_export_record(p_payload)
        inv_no = normalized.get("invoice_no")
        
        # Look for invoice '26001098' specifically (or print page 1-3)
        if inv_no == "26001098" or p.page_number <= 3:
            print(f"\n--- Page {p.page_number} (Invoice No: {inv_no}) ---")
            print("  DB canonical_payload root keys:", list(p_payload.keys()))
            if "header" in p_payload:
                print("  DB header:", p_payload["header"])
            items_list = p_payload.get("items") or p_payload.get("sections", {}).get("items") or []
            print("  DB items count:", len(items_list))
            for idx, itm in enumerate(items_list):
                print(f"    Item {idx}: taxable_value={itm.get('taxable_value')} amount={itm.get('amount') or itm.get('taxable_value')}")
            print("  Normalized total_taxable_value:", normalized.get("total_taxable_value"))
            print("  Normalized items count:", len(normalized.get("items", [])))
            for idx, itm in enumerate(normalized.get("items", [])):
                print(f"    Norm Item {idx}: taxable_value={itm.get('taxable_value')} amount={itm.get('total_amount')}")

if __name__ == "__main__":
    trace_sample_1()
