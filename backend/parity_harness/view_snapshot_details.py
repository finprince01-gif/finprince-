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

def view_snapshot(session_id):
    snapshot = FinalizedSnapshot.objects.filter(session_id=session_id).first()
    if not snapshot:
        print(f"No snapshot found for session {session_id}")
        return
    
    print(f"Snapshot ID: {snapshot.id}")
    compressed_bytes = StorageService().get_file(snapshot.s3_key)
    decompressed = gzip.decompress(compressed_bytes)
    payload = json.loads(decompressed)
    
    invoices = payload.get("data", [])
    print(f"Found {len(invoices)} invoices in snapshot:")
    for idx, inv in enumerate(invoices):
        inv_no = inv.get("invoice_no")
        taxable = inv.get("total_taxable_value")
        total = inv.get("total_invoice_value")
        cgst = inv.get("total_cgst")
        sgst = inv.get("total_sgst")
        igst = inv.get("total_igst")
        
        items = inv.get("items", [])
        sum_taxable = sum(float(item.get("taxable_value") or 0.0) for item in items)
        sum_cgst = sum(float(item.get("cgst") or 0.0) for item in items)
        sum_sgst = sum(float(item.get("sgst") or 0.0) for item in items)
        sum_igst = sum(float(item.get("igst") or 0.0) for item in items)
        sum_total = sum(float(item.get("total_amount") or 0.0) for item in items)
        
        failures = inv.get("validation_revision", {}).get("failures", [])
        warnings = inv.get("validation_warnings", [])
        
        print(f"\n[{idx}] Invoice No: {inv_no}")
        print(f"    Header  - Taxable: {taxable}, CGST: {cgst}, SGST: {sgst}, IGST: {igst}, Total: {total}")
        print(f"    ItemSum - Taxable: {sum_taxable:.2f}, CGST: {sum_cgst:.2f}, SGST: {sum_sgst:.2f}, IGST: {sum_igst:.2f}, Total: {sum_total:.2f}")
        if failures:
            print(f"    [FAILURES]: {failures}")
        if warnings:
            print(f"    [WARNINGS]: {warnings}")

if __name__ == "__main__":
    session_id = "forensic-sample_1-1781246142"
    if len(sys.argv) > 1:
        session_id = sys.argv[1]
    view_snapshot(session_id)
