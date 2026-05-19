import os
import json
import time
import uuid
import logging
import sys
import hashlib

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("VerificationScript")

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.storage import StorageService
from core.sqs import queue_service
from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot
from core.redis_orchestrator import orchestrator

def run_integration_test():
    tenant_id = "test-tenant-verification"
    session_id = f"verification-session-{uuid.uuid4().hex[:6]}"
    
    logger.info(f"=== STARTING END-TO-END DISTRIBUTED VERIFICATION ===")
    logger.info(f"Tenant: {tenant_id} | Session: {session_id}")
    
    storage = StorageService()
    
    # 1. Prepare files to upload
    files_to_test = [
        r"C:\108\AI-accounting-0.03 (9)\backend\media\test\forensic_invoice.pdf",
        r"C:\108\AI-accounting-0.03 (9)\backend\media\test\forensic_invoice_3pages.pdf"
    ]
    
    # Check that both files exist
    for fpath in files_to_test:
        if not os.path.exists(fpath):
            logger.error(f"Test file not found: {fpath}")
            sys.exit(1)
            
    # 2. Create Job
    job = BulkInvoiceJob.objects.create(
        tenant_id=tenant_id,
        upload_session_id=session_id,
        status='PENDING',
        total_files=len(files_to_test)
    )
    logger.info(f"Created BulkInvoiceJob: ID={job.id}")
    
    # 3. Process each file
    for idx, fpath in enumerate(files_to_test):
        fname = os.path.basename(fpath)
        with open(fpath, 'rb') as f:
            file_bytes = f.read()
            
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        
        # Upload using StorageService to maintain local/S3 consistency
        storage_key = f"bulk_pipeline/{session_id}/{fname}"
        storage_url = storage.upload_file(file_bytes, storage_key)
        logger.info(f"Uploaded {fname} to storage key={storage_key} url={storage_url}")
        
        # Create storage record with correct fields
        record = InvoiceTempOCR.objects.create(
            tenant_id=tenant_id,
            upload_session_id=session_id,
            file_path=storage_key,
            file_hash=file_hash,
            status='PENDING',
            voucher_type='Purchase'
        )
        
        # Create item record
        item = InvoiceProcessingItem.objects.create(
            job=job,
            tenant_id=tenant_id,
            file_path=storage_key,
            status='PENDING',
            staging_record_id=record.id
        )
        
        # Build canonical ingestion message payload
        from vouchers.message_factory import message_factory
        from core.middleware import get_correlation_id
        
        ingestion_payload = {
            "record_id": record.id,
            "job_id": str(job.id),
            "file_url": storage_key,
            "voucher_type": 'Purchase',
            "attempt": 1
        }
        
        msg = message_factory.create_message(
            task_type="INGESTION",
            tenant_id=tenant_id,
            session_id=session_id,
            payload=ingestion_payload,
            correlation_id=f"verify-corr-{uuid.uuid4().hex[:6]}"
        )
        
        # Push to ingestion queue
        logger.info(f"Pushing Ingestion message for record_id={record.id}")
        queue_service.push(msg, queue_type='ingestion')
        
    logger.info("=== BOTH MESSAGES ENQUEUED ===")
    logger.info("Waiting 30 seconds for distributed ingestion, AI, assembly, and finalized snapshot completion...")
    
    # Monitor completion for up to 60 seconds
    for second in range(1, 61):
        time.sleep(1)
        # Check snapshot table
        snapshot = FinalizedSnapshot.objects.filter(session_id=session_id).first()
        if snapshot:
            logger.info(f"🎉 SUCCESS! FinalizedSnapshot discovered after {second} seconds!")
            logger.info(f"Snapshot row count: {snapshot.total_invoices}")
            logger.info(f"Snapshot status: {snapshot.status}")
            break
            
        if second % 10 == 0:
            job.refresh_from_db()
            logger.info(f"[MONITOR] Elapsed: {second}s | Job Status: {job.status}")
            
    # Final assertion check
    snapshot = FinalizedSnapshot.objects.filter(session_id=session_id).first()
    if snapshot:
        logger.info("✅ Verification Integration Test: PASSED!")
        sys.exit(0)
    else:
        logger.error("❌ Verification Integration Test: FAILED (Snapshot was not created in time).")
        sys.exit(1)

if __name__ == "__main__":
    run_integration_test()
