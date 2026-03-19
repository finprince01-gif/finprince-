import os
import hashlib
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from django.db import transaction, connection
from .models import BulkInvoiceJob, InvoiceProcessingItem
from .extraction_logic import perform_ocr_extraction
from core.ocr_cache import save_ocr_cache, get_cached_ocr
from core.processing_engine import run_invoice_processing_pipeline

logger = logging.getLogger(__name__)

def get_file_hash(file_bytes):
    return hashlib.sha256(file_bytes).hexdigest()

def process_item(item_id):
    # Ensure fresh DB connection for the thread
    connection.close()

    try:
        item = InvoiceProcessingItem.objects.select_related('job').get(id=item_id)
        job = item.job

        # Double check status
        if item.status != 'pending':
            return

        # 1. Update status to processing
        item.status = 'processing'
        item.save()

        # 2. Check cache (by hash) in staging table (invoice_ocr_temp)
        cached_ocr = get_cached_ocr(item.file_hash, job.tenant_id)

        if cached_ocr and cached_ocr.get('extracted_data'):
            # Stop execution immediately - already in cache
            item.result_json = cached_ocr['extracted_data']
            item.status = 'done'
            item.save()
            
            with transaction.atomic():
                job = BulkInvoiceJob.objects.select_for_update().get(id=job.id)
                job.processed_count += 1
                job.save()
            return

        # 3. Call AI
        if not os.path.exists(item.file_path):
            raise Exception(f"File not found: {item.file_path}")

        with open(item.file_path, 'rb') as f:
            file_bytes = f.read()

        ext = os.path.splitext(item.file_path)[1].lower()
        mime_type = 'application/pdf' if ext == '.pdf' else 'image/jpeg'

        # perform_ocr_extraction handles retries and timeout
        processed_data = perform_ocr_extraction(file_bytes, mime_type)

        item.result_json = processed_data
        item.status = 'done'
        item.save()

        # STEP 1: FIX DATA VISIBILITY - Save to OCR Staging
        # We use a placeholder session_id if none exists
        save_ocr_cache(
            file_hash=item.file_hash,
            tenant_id=job.tenant_id,
            file_path=item.file_path,
            extracted_data=processed_data,
            validation_status='PENDING'
        )
        # STEP 2: Trigger Validation pipeline
        run_invoice_processing_pipeline(item.file_hash, job.tenant_id)
        print("OCR STAGING SAVED:", processed_data)

        with transaction.atomic():
            job = BulkInvoiceJob.objects.select_for_update().get(id=job.id)
            job.processed_count += 1
            job.save()

    except Exception as e:
        logger.error(f"Error processing item {item_id}: {str(e)}")
        # Reload item to ensure we have latest state
        item = InvoiceProcessingItem.objects.get(id=item_id)
        item.status = 'failed'
        item.error_message = str(e)
        item.save()

        with transaction.atomic():
            job = BulkInvoiceJob.objects.select_for_update().get(id=job.id)
            job.failed_count += 1
            job.save()

def process_bulk_job_internal(job_id):
    try:
        # Atomic Double-Check Locking
        with transaction.atomic():
            job = BulkInvoiceJob.objects.select_for_update().get(id=job_id)
            if job.status == 'processing':
                logger.warning(f"Job {job_id} already processing, bailing out.")
                return

            # Set job status to processing
            job.status = 'processing'
            job.save()

        items = job.items.filter(status='pending')
        item_ids = [item.id for item in items]

        # Use 2 workers as requested for concurrency control
        with ThreadPoolExecutor(max_workers=2) as executor:
            executor.map(process_item, item_ids)

        # Refresh job state
        job = BulkInvoiceJob.objects.get(id=job_id)
        job.status = 'completed'
        job.save()
        logger.info(f"Bulk job {job_id} completed. Processed: {job.processed_count}, Failed: {job.failed_count}")
        
    except Exception as e:
        logger.error(f"Critical error in bulk job {job_id}: {str(e)}")
        BulkInvoiceJob.objects.filter(id=job_id).update(status='failed')

def start_bulk_job_thread(job_id):
    """Entry point to start the background process"""
    thread = threading.Thread(target=process_bulk_job_internal, args=(job_id,))
    thread.daemon = True # Don't block exit
    thread.start()
