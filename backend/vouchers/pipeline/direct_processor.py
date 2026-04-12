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
                
                # Extract and Process using the unified new pipeline
                from ocr_pipeline.service import process_invoice_upload
                import os
                
                # Fetch filename (extracting original name from key f"jobs/{job_id}/{uuid}---{name}")
                raw_filename = os.path.basename(item.file_path)
                file_name = raw_filename if '---' not in raw_filename else raw_filename.split('---', 1)[1]
                
                res = process_invoice_upload(
                    file_bytes=file_bytes,
                    voucher_type=voucher_type,
                    file_name=file_name,
                    upload_session_id=getattr(job, 'upload_session_id', None) or str(job.id),
                    tenant_id=str(job.tenant_id)
                )

                final_status = res.get('validation_status', 'VALIDATION_FAILED')
                
                # Treat as success unless the pipeline explicitly returned FAILED or ERROR
                is_failed = res.get('status') == 'FAILED' or final_status in ['ERROR', 'VALIDATION_FAILED']
                item.status = 'failed' if is_failed else 'success'
                item.result_json = res.get('data') or {}
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
