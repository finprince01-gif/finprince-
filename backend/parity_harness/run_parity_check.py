import os
import sys
import json
import logging
import asyncio
import time
import uuid
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ParityCheck")

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from parity_harness.compare_framework import compare_snapshots
from vouchers.unified_worker import UnifiedWorker
from ocr_pipeline.models import FinalizedSnapshot, InvoiceTempOCR
from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from asgiref.sync import sync_to_async

DATASET_DIR = current_dir / "parity_harness" / "dataset"
GOLDEN_DIR = current_dir / "parity_harness" / "golden_outputs"
RESULTS_DIR = current_dir / "parity_harness" / "results"

async def run_parity_test_for_file(file_path: Path):
    golden_path = GOLDEN_DIR / f"{file_path.stem}.json"
    if not golden_path.exists():
        logger.warning(f"Skipping {file_path.name}: No golden output found at {golden_path}")
        return None

    with open(golden_path, "r") as f:
        golden_data = json.load(f)

    logger.info(f"Testing UnifiedWorker path for {file_path.name}")
    
    tenant_id = "parity-test-tenant"
    session_id = f"test-run-{int(time.time())}-{uuid.uuid4().hex[:4]}"
    
    def _prepare_db():
        from django.db import transaction
        from vouchers.pipeline import storage
        
        with open(file_path, "rb") as f:
            file_bytes = f.read()
        
        storage_key = storage.upload_bytes(file_bytes, f"parity_test/{file_path.name}")
        file_hash = storage.hash_bytes(file_bytes)
        
        with transaction.atomic():
            job = BulkInvoiceJob.objects.create(tenant_id=tenant_id, upload_session_id=session_id)
            record = InvoiceTempOCR.objects.create(
                tenant_id=tenant_id, 
                upload_session_id=session_id,
                file_path=storage_key,
                file_hash=file_hash,
                voucher_type='Purchase'
            )
            item = InvoiceProcessingItem.objects.create(
                job=job, 
                tenant_id=tenant_id, 
                file_path=storage_key,
                status='PENDING',
                staging_record_id=record.id
            )
            return item.id, record.id, job.id

    item_id, record_id, job_id = await sync_to_async(_prepare_db)()

    task = {
        "type": "extraction",
        "item_id": item_id,
        "record_id": record_id,
        "job_id": job_id,
        "tenant_id": tenant_id
    }

    worker = UnifiedWorker()
    try:
        await worker.execute_extraction(task)
        
        def _get_result():
            new_snapshot = FinalizedSnapshot.objects.filter(snapshot_json__metadata__original_record_id=record_id).first()
            if not new_snapshot:
                return None
            return new_snapshot.snapshot_json
            
        new_data = await sync_to_async(_get_result)()
        
        if not new_data:
            return {"file": file_path.name, "error": "No snapshot generated"}
            
        # Compare
        report = compare_snapshots(golden_data, new_data)
        report["file"] = file_path.name
        return report

    except Exception as e:
        logger.error(f"Error testing {file_path.name}: {e}")
        return {"file": file_path.name, "error": str(e)}

    except Exception as e:
        logger.error(f"Error testing {file_path.name}: {e}")
        return {"file": file_path.name, "error": str(e)}

async def main():
    import time
    if not RESULTS_DIR.exists():
        RESULTS_DIR.mkdir(parents=True)
        
    files = list(DATASET_DIR.glob("*.pdf"))
    reports = []
    
    for f in files:
        report = await run_parity_test_for_file(f)
        if report:
            reports.append(report)
            
    summary_path = RESULTS_DIR / f"summary_{int(time.time())}.json"
    with open(summary_path, "w") as f:
        json.dump(reports, f, indent=4)
        
    logger.info(f"Parity check complete. Summary saved to {summary_path}")
    
    # Print summary to console
    total = len(reports)
    passed = len([r for r in reports if r.get("parity")])
    logger.info(f"TOTAL: {total} | PASSED: {passed} | FAILED: {total - passed}")

if __name__ == "__main__":
    asyncio.run(main())
