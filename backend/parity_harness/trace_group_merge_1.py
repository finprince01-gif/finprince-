import os
import sys
import copy
import json
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoicePageResult
from ocr_pipeline.normalize import get_canonical_export_record, get_ui_payload
from ocr_pipeline.forensic_merger import get_forensic_merger

def trace_merge():
    target_id = 1007165
    pages = list(InvoicePageResult.objects.filter(record_id=target_id).order_by("page_number"))
    
    # Normalize each page first
    pages_list = []
    for p in pages:
        p_norm = get_canonical_export_record(p.canonical_payload)
        p_norm["_page_no"] = p.page_number
        p_norm["_physical_page_no"] = p.page_number
        pages_list.append(p_norm)
        
    merger = get_forensic_merger()
    groups_dict = merger.group_invoices(pages_list)
    print(f"Groups found: {list(groups_dict.keys())}")
    
    for group_id, group_list in groups_dict.items():
        if "26001098" not in group_id:
            continue
        print(f"\n--- Group: {group_id} (Invoice No: {group_list[0].get('invoice_no')}) ---")
        print(f"Pages in group: {[p.get('_page_no') for p in group_list]}")
        for p in group_list:
            p_items = p.get("items", [])
            print(f"  Page {p.get('_page_no')} item structure: {p_items[0] if p_items else 'No items'}")
            item_keys = []
            for itm in p_items:
                desc = str(itm.get("description") or itm.get("item_name") or "").strip().lower()
                qty = float(itm.get("qty") or itm.get("quantity") or 0.0)
                rate = float(itm.get("rate") or 0.0)
                amt = float(itm.get("taxable_value") or itm.get("amount") or 0.0)
                item_keys.append((desc, qty, rate, amt))
            page_items_key = tuple(sorted(item_keys))
            print(f"  Page {p.get('_page_no')}: total_taxable_value={p.get('total_taxable_value')} items sum={sum(float(i.get('taxable_value') or 0) for i in p.get('items', []))} items_key={page_items_key}")
        
        # Trace the merge_group
        merged = merger.merge_group(group_list)
        print("After merge_group:")
        print("  total_taxable_value:", merged.get("total_taxable_value"))
        print("  header.taxable_value:", merged.get("header", {}).get("taxable_value"))
        print("  items sum:", sum(float(i.get("taxable_value") or 0) for i in merged.get("items", [])))
        
        # Trace get_ui_payload
        ui_pay = get_ui_payload(merged)
        print("After get_ui_payload:")
        print("  total_taxable_value:", ui_pay.get("total_taxable_value"))
        print("  header.taxable_value:", ui_pay.get("header", {}).get("taxable_value"))
        print("  items sum:", sum(float(i.get("taxable_value") or 0) for i in ui_pay.get("items", [])))

if __name__ == "__main__":
    trace_merge()
