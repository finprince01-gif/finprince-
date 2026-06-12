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

from ocr_pipeline.models import FinalizedSnapshot, InvoiceTempOCR, InvoicePageResult
from core.storage import StorageService

def get_snapshot_payload(snapshot_id_str):
    snapshot = FinalizedSnapshot.objects.get(id=snapshot_id_str)
    compressed_bytes = StorageService().get_file(snapshot.s3_key)
    decompressed = gzip.decompress(compressed_bytes)
    return json.loads(decompressed)

def analyze_snapshots():
    snapshots = [
        ("sample_2.pdf (2-page continuation)", "392d0684-6010-46c6-be80-201759369c60"),
        ("sample_1.pdf (16-page batch / multi-invoices)", "c64cdc05-aebe-411a-8232-77b58b01af8b"),
        ("IMG_20260406_0006.pdf (duplicate copy)", "7b96ef3d-beac-4c08-b0e0-8f91b6fdaab7")
    ]
    
    for desc, snap_id in snapshots:
        print(f"\n============================================================")
        print(f"ANALYZE SNAPSHOT: {desc} (ID: {snap_id})")
        print(f"============================================================")
        try:
            payload = get_snapshot_payload(snap_id)
            invoices = payload.get("data", [])
            print(f"Total Invoices in Snapshot: {len(invoices)}")
            print(f"{'Invoice Number':<20} | {'Header Taxable':<15} | {'Item Sum':<15} | {'Difference':<10} | {'Item Count':<10}")
            print("-" * 80)
            for inv in invoices:
                inv_no = inv.get("invoice_no") or "UNKNOWN"
                header_taxable = float(inv.get("total_taxable_value") or 0.0)
                items = inv.get("items", [])
                item_sum = sum(float(itm.get("taxable_value") or 0.0) for itm in items)
                diff = round(header_taxable - item_sum, 4)
                item_count = len(items)
                print(f"{inv_no:<20} | {header_taxable:<15.2f} | {item_sum:<15.2f} | {diff:<10.2f} | {item_count:<10}")
                # Print item details briefly
                for idx, itm in enumerate(items):
                    print(f"   - Item [{idx}]: desc='{itm.get('description', '')[:40]}' qty={itm.get('qty')} rate={itm.get('rate')} taxable={itm.get('taxable_value')}")
        except Exception as e:
            print(f"Error analyzing {desc}: {e}")

if __name__ == "__main__":
    analyze_snapshots()
