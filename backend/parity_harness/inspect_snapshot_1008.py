import os
import sys
import json
import gzip
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import FinalizedSnapshot
from core.storage import StorageService

def inspect():
    snapshot = FinalizedSnapshot.objects.order_by('-created_at').first()
    if not snapshot:
        print("No snapshots found.")
        return
    
    compressed_bytes = StorageService().get_file(snapshot.s3_key)
    decompressed = gzip.decompress(compressed_bytes)
    payload = json.loads(decompressed)
    
    invoices = payload.get("data", [])
    inv_1008 = next((inv for inv in invoices if inv.get("invoice_no") == "26001008"), None)
    if not inv_1008:
        print("Invoice 26001008 not found in latest snapshot.")
        return
        
    print("=== INVOICE 26001008 ===")
    print(f"Vendor Name: {inv_1008.get('vendor_name')}")
    print(f"Total Amount: {inv_1008.get('total_invoice_value')}")
    print(f"Taxable Value: {inv_1008.get('total_taxable_value')}")
    print(f"CGST: {inv_1008.get('total_cgst')}")
    print(f"SGST: {inv_1008.get('total_sgst')}")
    print(f"IGST: {inv_1008.get('total_igst')}")
    print("Items:")
    for idx, item in enumerate(inv_1008.get("items", [])):
        print(f"  [{idx}] Name: {item.get('Item Name') or item.get('description')}")
        print(f"      Qty: {item.get('Qty') or item.get('quantity')}, Rate: {item.get('Item Rate') or item.get('rate')}, Taxable: {item.get('Taxable Value') or item.get('taxable_value')}, CGST: {item.get('CGST') or item.get('cgst_amount') or item.get('cgst')}")

if __name__ == "__main__":
    inspect()
