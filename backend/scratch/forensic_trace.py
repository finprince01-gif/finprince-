
import os
import django
import json
import sys

# Set up Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot

def trace_invoice(inv_no):
    print(f"Tracing Invoice: {inv_no}")
    record = InvoiceTempOCR.objects.filter(supplier_invoice_no=inv_no).first()
    if not record:
        print("Invoice not found in InvoiceTempOCR")
        return

    print("--- [STAGE 4] DB PERSISTENCE (InvoiceTempOCR) ---")
    print(f"Record ID: {record.id}")
    print(f"Session ID: {record.upload_session_id}")
    print(f"GSTIN: {record.gstin}")
    
    data = record.extracted_data or {}
    print(f"Authoritative Keys: {list(data.keys())}")
    
    header = data.get('header', {})
    print(f"Header Keys: {list(header.keys())}")
    
    def get_val(obj, keys):
        for k in keys:
            v = obj.get(k)
            if v is not None and str(v).strip() not in ("", "None"):
                return v
        return None

    vendor_name = get_val(data, ['vendor_name', 'Name']) or get_val(header, ['vendor_name', 'Name'])
    print(f"Vendor Name: {vendor_name}")
    
    total_taxable = get_val(data, ['total_taxable_value', 'Total Taxable Value']) or get_val(header, ['total_taxable_value', 'Total Taxable Value'])
    print(f"Total Taxable: {total_taxable}")
    
    invoice_total = get_val(data, ['invoice_total', 'Total Invoice Value']) or get_val(header, ['invoice_total', 'Total Invoice Value'])
    print(f"Invoice Total: {invoice_total}")
    
    items = data.get('items', [])
    print(f"Item Count: {len(items)}")
    if items:
        it0 = items[0]
        print(f"Item[0] Keys: {list(it0.keys())}")
        it0_desc = get_val(it0, ['description', 'Item Name'])
        it0_rate = get_val(it0, ['rate', 'Item Rate'])
        it0_qty = get_val(it0, ['qty', 'quantity', 'Qty'])
        it0_taxable = get_val(it0, ['taxable_value', 'Taxable Value', 'amount'])
        
        print(f"Item[0] Desc: {it0_desc}")
        print(f"Item[0] Rate: {it0_rate}")
        print(f"Item[0] Qty: {it0_qty}")
        print(f"Item[0] Taxable: {it0_taxable}")

    print("\n--- [STAGE 5] SNAPSHOT JSON ---")
    snapshot = FinalizedSnapshot.objects.filter(session_id=record.upload_session_id).first()
    if snapshot:
        print(f"Snapshot ID: {snapshot.id}")
        print(f"Invoice Count: {snapshot.invoice_count}")
        snap_data = snapshot.snapshot_json or {}
        # Invoices are likely stored in a list or dict
        # We need to find the specific invoice in the snapshot
        invoices = snap_data.get('invoices', [])
        if isinstance(invoices, dict): # Sometimes it's a dict GRP_...
            invoices = list(invoices.values())
        
        found_in_snap = False
        for inv in invoices:
            if isinstance(inv, list): # Grouped
                inv = inv[0] # Take first in group if it's a list of pages
            
            curr_no = inv.get('invoice_no') or inv.get('Invoice No') or inv.get('supplier_invoice_no')
            if curr_no == inv_no:
                print(f"FOUND IN SNAPSHOT. Keys: {list(inv.keys())}")
                print(f"Snapshot GSTIN: {inv.get('gstin') or inv.get('GSTIN')}")
                print(f"Snapshot Total: {inv.get('invoice_total') or inv.get('Total Invoice Value')}")
                snap_items = inv.get('items', [])
                print(f"Snapshot Item Count: {len(snap_items)}")
                if snap_items:
                    sit0 = snap_items[0]
                    print(f"Snapshot Item[0] Keys: {list(sit0.keys())}")
                    print(f"Snapshot Item[0] Desc: {sit0.get('description') or sit0.get('Item Name')}")
                found_in_snap = True
                break
        if not found_in_snap:
            print("Invoice NOT found in snapshot invoices list.")
    else:
        print("Snapshot not found for this session.")

if __name__ == "__main__":
    trace_invoice("TN2507000597")
