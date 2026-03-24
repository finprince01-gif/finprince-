"""
Direct In-Process Processor for Bulk Invoice Jobs
=================================================
Replaces Kafka/Celery by running the extraction pipeline in a thread pool.
"""

import logging
import concurrent.futures
import traceback
from django.db import connection
from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from vouchers.pipeline.health import SystemHealth
from vouchers.extraction_logic import perform_ocr_extraction
from core.ocr_cache import save_ocr_cache, update_ocr_cache_validation_status, compute_file_hash, get_cached_ocr, update_ocr_cache_session
from core.processing_engine import run_invoice_processing_pipeline
from core.usage_service import check_and_increment_usage
from . import storage

logger = logging.getLogger(__name__)

def process_bulk_job(job_id: int, voucher_type: str = 'Purchase'):
    """
    Entry point for background processing of a bulk job.
    Called in a separate thread from the API view.
    """
    print(f"DEBUG: Entering process_bulk_job for Job ID {job_id}")
    try:
        job = BulkInvoiceJob.objects.get(id=job_id)
        print(f"DEBUG: Found Job {job_id}, status: {job.status}. Setting to processing.")
        job.status = 'processing'
        job.save()

        items = job.items.filter(parent_item_id=None)
        
        def worker(item_id):
            # Each worker needs its own DB connection in thread pool
            try:
                item = InvoiceProcessingItem.objects.get(id=item_id)
                item.status = 'processing'
                item.save()

                # Get file from storage
                file_bytes = storage.download_bytes(item.file_path)
                file_hash = item.file_hash or compute_file_hash(file_bytes)
                
                # Check cache first (Idempotency)
                existing = get_cached_ocr(file_hash, job.tenant_id)
                if existing:
                    # Reuse if already READY
                    if existing.get('validation_status') in ['READY', 'DUPLICATE', 'GSTIN_CONFLICT', 'Voucher Created', 'VENDOR_MISSING']:
                        update_ocr_cache_session(existing['id'], job.upload_session_id)
                        item.status = 'success'
                        item.save()
                        return True
                
                # Perform Extraction
                # Hint: extractor will guess columns if none passed
                raw_extracted_data = perform_ocr_extraction(
                    file_bytes, 
                    'application/pdf' if item.file_path.lower().endswith('.pdf') else 'image/jpeg'
                )

                if not raw_extracted_data:
                    item.status = 'failed'
                    item.error_message = "AI Extraction Failed"
                    item.save()
                    update_ocr_cache_validation_status(file_hash, job.tenant_id, 'EXTRACTION_FAILED')
                    return False

                # Save to staging/cache
                save_ocr_cache(
                    file_hash=file_hash,
                    tenant_id=job.tenant_id,
                    upload_session_id=job.upload_session_id,
                    file_path=item.file_path,
                    ocr_raw_text="",
                    extracted_data=raw_extracted_data,
                    validation_status='PROCESSING',
                )

                # Run Pipeline (Validation, Mapping, Vendor Match)
                pipeline_res = run_invoice_processing_pipeline(
                    file_hash=file_hash,
                    tenant_id=job.tenant_id,
                    voucher_type=voucher_type
                )
                
                final_status = pipeline_res.get('status', 'VALIDATION_FAILED')
                
                # Update item status to 'success' (important for BulkStatusAPIView)
                item.status = 'success' if final_status in ['READY', 'DUPLICATE', 'GSTIN_CONFLICT', 'VENDOR_MISSING'] else 'failed'
                item.result_json = raw_extracted_data
                item.save()
                
                logger.info(f"Item {item_id} processed: {final_status}")
                return True

            except Exception as e:
                logger.error(f"Worker crashed for item {item_id}: {e}\n{traceback.format_exc()}")
                try:
                    InvoiceProcessingItem.objects.filter(id=item_id).update(status='failed', error_message=str(e))
                except: pass
                return False
            finally:
                connection.close()

        # Run concurrently
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            item_ids = [it.id for it in items]
            list(executor.map(worker, item_ids))

        # Mark job finished
        job.status = 'completed'
        job.save()
        print(f"DEBUG: Bulk Job {job_id} Completed Successfully.")
        logger.info(f"Bulk Job {job_id} Completed.")

    except BulkInvoiceJob.DoesNotExist:
        logger.error(f"Job {job_id} not found for processing.")
    except Exception as e:
        print(f"DEBUG: ERROR in process_bulk_job {job_id}: {e}")
        logger.error(f"Job {job_id} processor crashed: {e}")
        if 'job' in locals():
            job.status = 'failed'
            job.save()
