import os
import sys
import json
import gzip
import time
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot
from ocr_pipeline.pipeline import run_ocr_pipeline, assemble_multi_page_record
from core.storage import StorageService
from django.db import transaction

dataset_dir = current_dir / "parity_harness" / "dataset"
files = [
    "sample_2.pdf",
    "3db8e94f---IMG_20260406_0006.pdf",
    "7d8c0317---IMG_20260406_0006.pdf",
    "86f110b9---IMG_20260406_0006.pdf",
    "a48631fa---IMG_20260406_0006.pdf",
    "fe32689d---IMG_20260406_0006.pdf",
    "sample_1.pdf"
]

def run_sample(file_name):
    file_path = dataset_dir / file_name
    if not file_path.exists():
        print(f"File not found: {file_path}")
        return
    
    print(f"\n============================================================")
    print(f"RUNNING PIPELINE FOR {file_name}")
    print(f"============================================================")

    tenant_id = "parity-test-tenant"
    session_id = f"forensic-{file_name.split('.')[0]}-{int(time.time())}"
    abs_file_path = str(file_path.resolve())
    
    with open(abs_file_path, "rb") as f:
        file_bytes = f.read()

    from vouchers.pipeline import storage
    storage_key = storage.upload_bytes(file_bytes, f"parity_test/{file_name}")
    file_hash = storage.hash_bytes(file_bytes)

    with transaction.atomic():
        record = InvoiceTempOCR.objects.create(
            tenant_id=tenant_id,
            upload_session_id=session_id,
            file_path=storage_key,
            file_hash=file_hash,
            status='UPLOADING',
            voucher_type='Purchase'
        )

    print(f"Created InvoiceTempOCR record ID: {record.id}")

    try:
        pipeline_res = run_ocr_pipeline(record=record, wait_for_ai=True, file_path=abs_file_path)
        print(f"Pipeline Result status: {pipeline_res.get('status') if pipeline_res else 'None'}")
        
        record.refresh_from_db()
        print(f"DB Record Status: {record.status}")

        assembly_res = assemble_multi_page_record(record)
        print(f"Assembly Result: {assembly_res}")

        snapshot = FinalizedSnapshot.objects.filter(session_id=record.upload_session_id).first()
        if snapshot:
            print("OK: Finalized Snapshot created!")
            compressed_bytes = StorageService().get_file(snapshot.s3_key)
            decompressed = gzip.decompress(compressed_bytes)
            payload = json.loads(decompressed)
            
            invoices = payload.get("invoices", [])
            for idx, inv in enumerate(invoices):
                print(f"  Invoice [{idx}]: No={inv.get('invoice_no')}, Date={inv.get('invoice_date')}")
                print(f"    Header Taxable={inv.get('total_taxable_value')}, Header Total={inv.get('total_invoice_value')}")
                items = inv.get("items", [])
                items_taxable_sum = sum(float(item.get("taxable_value") or 0.0) for item in items)
                print(f"    Items Sum Taxable={items_taxable_sum}")
                print(f"    Failures: {inv.get('validation_revision', {}).get('failures', [])}")
        else:
            print("FAIL: No snapshot generated.")
            record.refresh_from_db()
            print(f"    Record Status: {record.status} | Validation Status: {record.validation_status} | Validation Message: {record.validation_message}")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        run_sample(sys.argv[1])
    else:
        for f in files:
            run_sample(f)
