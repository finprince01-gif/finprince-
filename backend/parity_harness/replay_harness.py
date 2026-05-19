import os
import sys
import json
import logging
import time
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ReplayHarness")

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot
from ocr_pipeline.pipeline import run_ocr_pipeline, assemble_multi_page_record
from vouchers.pipeline import storage
from django.db import transaction

DATASET_DIR = current_dir / "parity_harness" / "dataset"
GOLDEN_DIR = current_dir / "parity_harness" / "golden_outputs"

def run_golden_extraction(file_path: Path):
    logger.info(f"Running Golden Extraction for {file_path.name}")
    
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    
    # Create a temporary record for this run
    tenant_id = "parity-test-tenant"
    session_id = f"parity-run-{int(time.time())}"
    
    # Upload to storage first to get a valid key
    storage_key = storage.upload_bytes(file_bytes, f"parity_test/{file_path.name}")
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
        
        # Run the pipeline synchronously
        logger.info(f"Starting pipeline for record {record.id}")
        run_ocr_pipeline(file_bytes=file_bytes, record=record, wait_for_ai=True)
        
        # Assemble
        logger.info(f"Assembling record {record.id}")
        result = assemble_multi_page_record(record)
        
        if result.get("status") == "FINALIZED":
            snapshot = FinalizedSnapshot.objects.filter(snapshot_json__metadata__original_record_id=record.id).first()
            if snapshot:
                output_path = GOLDEN_DIR / f"{file_path.stem}.json"
                with open(output_path, "w") as f:
                    json.dump(snapshot.snapshot_json, f, indent=4)
                logger.info(f"✅ Golden output saved to {output_path}")
            else:
                logger.error(f"❌ Failed to find snapshot for record {record.id}")
        else:
            logger.error(f"❌ Pipeline failed for {file_path.name}: {result}")

def main():
    if not GOLDEN_DIR.exists():
        GOLDEN_DIR.mkdir(parents=True)
        
    files = list(DATASET_DIR.glob("*.pdf"))
    if not files:
        logger.warning(f"No PDF files found in {DATASET_DIR}")
        return
        
    for f in files:
        try:
            run_golden_extraction(f)
        except Exception as e:
            logger.error(f"Failed to process {f.name}: {e}", exc_info=True)

if __name__ == "__main__":
    main()
