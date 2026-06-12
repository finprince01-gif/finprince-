import os
import sys
import json
import logging
import time
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
logger = logging.getLogger("ForensicRun")

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot
from ocr_pipeline.pipeline import run_ocr_pipeline, assemble_multi_page_record
from django.db import transaction

def run_forensic_validation(file_name: str):
    file_path = current_dir / "parity_harness" / "dataset" / file_name
    if not file_path.exists():
        logger.error(f"File not found: {file_path}")
        return

    logger.info(f"============================================================")
    logger.info(f"STARTING FORENSIC VALIDATION FOR {file_name}")
    logger.info(f"============================================================")

    tenant_id = "parity-test-tenant"
    session_id = f"forensic-run-{int(time.time())}"

    # We use the absolute path directly in run_ocr_pipeline
    abs_file_path = str(file_path.resolve())
    
    with open(abs_file_path, "rb") as f:
        file_bytes = f.read()

    from vouchers.pipeline import storage
    # Upload to storage to keep DB file_path field valid
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

    logger.info(f"Created InvoiceTempOCR record ID: {record.id} with key: {storage_key}")

    try:
        # Run the pipeline synchronously with file_path provided!
        logger.info(f"Executing run_ocr_pipeline for record {record.id}...")
        pipeline_res = run_ocr_pipeline(
            record=record,
            wait_for_ai=True,
            file_path=abs_file_path
        )
        logger.info(f"Pipeline Result status: {pipeline_res.get('status') if pipeline_res else 'None'}")
        
        # Refresh the in-memory record from DB to synchronize status
        logger.info(f"In-memory status before refresh: {record.status}")
        record.refresh_from_db()
        logger.info(f"In-memory status after refresh: {record.status}")

        # Assemble
        logger.info(f"Assembling record {record.id}...")
        assembly_res = assemble_multi_page_record(record)
        logger.info(f"Assembly Result: {assembly_res}")

        # Fetch finalized snapshot if any
        snapshot = FinalizedSnapshot.objects.filter(session_id=record.upload_session_id).first()
        if snapshot:
            logger.info("✅ Finalized Snapshot successfully created!")
            print(json.dumps(snapshot.snapshot_json, indent=2))
        else:
            logger.error("❌ No snapshot generated for record.")
            # Print latest status from DB
            record.refresh_from_db()
            logger.info(f"DB Record Status: {record.status} | Validation Status: {record.validation_status} | Validation Message: {record.validation_message}")

    except Exception as e:
        logger.exception(f"Exception during forensic run: {e}")

if __name__ == "__main__":
    file_name = "sample_2.pdf" if len(sys.argv) < 2 else sys.argv[1]
    run_forensic_validation(file_name)
