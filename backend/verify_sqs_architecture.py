import os
import json
import time
import uuid
import logging
import sys

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ArchitectureVerification")

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Mock Environment for SQS (if not already set)
# os.environ['QUEUE_BACKEND'] = 'sqs' 

import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

try:
    from core.sqs import queue_service
    from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
    from ocr_pipeline.models import InvoiceTempOCR
except ImportError as e:
    logger.error(f"Import failed: {e}")
    sys.exit(1)

def test_sqs_ingestion_path():
    tenant_id = "test-tenant-123"
    session_id = f"test-session-{uuid.uuid4().hex[:6]}"
    
    logger.info(f"Starting SQS Verification Test | Session: {session_id}")
    
    # 1. Create Mock Job
    job = BulkInvoiceJob.objects.create(
        tenant_id=tenant_id,
        upload_session_id=session_id,
        status='PENDING',
        total_files=1
    )
    
    # 2. Create Mock Record
    record = InvoiceTempOCR.objects.create(
        tenant_id=tenant_id,
        upload_session_id=session_id,
        file_path="test_invoice.pdf",
        status='UPLOADING',
        voucher_type='Purchase'
    )
    
    # 3. Create Mock Item
    item = InvoiceProcessingItem.objects.create(
        job=job,
        tenant_id=tenant_id,
        file_path="/tmp/test_invoice.pdf",
        status='PENDING',
        staging_record_id=record.id
    )
    
    # 4. Push to Ingestion Queue
    task = {
        'id': f"test_ingest_{job.id}",
        'job_id': job.id,
        'item_id': item.id,
        'record_id': record.id,
        'tenant_id': tenant_id,
        'upload_session_id': session_id,
        'type': 'ingestion'
    }
    
    logger.info(f"Pushing task to queue: {task['id']}")
    success = queue_service.push(task, queue_type='ingestion')
    
    if success:
        logger.info("✅ Successfully pushed task to queue.")
    else:
        logger.error("❌ Failed to push task to queue.")

if __name__ == "__main__":
    test_sqs_ingestion_path()
