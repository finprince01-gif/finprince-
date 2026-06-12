import os
import sys
import copy
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoicePageResult
from ocr_pipeline.normalize import get_canonical_export_record
from ocr_pipeline.forensic_merger import get_forensic_merger

def test_steps():
    r1 = InvoicePageResult.objects.get(record_id=1007164, page_number=1)
    r2 = InvoicePageResult.objects.get(record_id=1007164, page_number=2)
    
    p1 = get_canonical_export_record(r1.canonical_payload)
    p2 = get_canonical_export_record(r2.canonical_payload)
    
    print("Before Merge:")
    print("Page 1 total_taxable_value:", p1.get("total_taxable_value"))
    print("Page 2 total_taxable_value:", p2.get("total_taxable_value"))
    
    merger = get_forensic_merger()
    merged = copy.deepcopy(p1)
    
    # Trace safe_merge
    print("\nCalling safe_merge(merged, p2)...")
    merger.safe_merge(merged, p2)
    print("After safe_merge total_taxable_value:", merged.get("total_taxable_value"))
    
    # Trace recompute_totals_if_needed
    print("\nCalling recompute_totals_if_needed(merged, is_multipage=True)...")
    merger.recompute_totals_if_needed(merged, is_multipage=True)
    print("After recompute total_taxable_value:", merged.get("total_taxable_value"))
    
    # Trace the second normalization call
    print("\nCalling get_canonical_export_record(merged) (like get_ui_payload)...")
    final_payload = get_canonical_export_record(merged)
    print("Final payload total_taxable_value:", final_payload.get("total_taxable_value"))

if __name__ == "__main__":
    test_steps()
