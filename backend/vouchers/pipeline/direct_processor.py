"""
Distributed Processor for Bulk Invoice Jobs
===========================================
Handles individual page tasks with idempotency, retries, and batch DB writes.
"""

import logging
import concurrent.futures
import traceback
import time
import random
from django.db import connection, transaction
from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from vouchers.pipeline.health import SystemHealth
from core.redis_client import redis_client
from . import storage

logger = logging.getLogger(__name__)

def worker(item_id, job_id, voucher_type, upload_session_id, tenant_id):
    """
    Page-level task worker. 
    Implements Idempotency, Retries, and Error Handling.
    """
    MAX_RETRIES = 3
    attempt = 0
    
    while attempt <= MAX_RETRIES:
        try:
            # Each process needs its own DB connection
            from django import db
            db.connections.close_all()
            
            # 1. IDEMPOTENCY CHECK — PID-safe: triggers lazy Redis init in subprocess
            task_lock_key = f"lock:item:{item_id}"
            if redis_client.is_healthy():
                if not redis_client.get_client().setnx(task_lock_key, "locked"):
                    logger.warning(f"Item {item_id} already locked. Skipping.")
                    return {'item_id': item_id, 'status': 'skipped'}
                redis_client.get_client().expire(task_lock_key, 600)  # 10 min lock

            item = InvoiceProcessingItem.objects.get(id=item_id)
            if item.status == 'success':
                redis_client.get_client().delete(task_lock_key)
                return {'item_id': item_id, 'status': 'success', 'result_json': item.result_json}

            # 2. FILE DOWNLOAD
            file_bytes = storage.download_bytes(item.file_path)
            
            # 3. OCR + AI PIPELINE
            from ocr_pipeline.service import process_invoice_upload
            import os
            
            raw_filename = os.path.basename(item.file_path)
            file_name = raw_filename if '---' not in raw_filename else raw_filename.split('---', 1)[1]
            
            res = process_invoice_upload(
                file_bytes=file_bytes,
                voucher_type=voucher_type,
                file_name=file_name,
                upload_session_id=upload_session_id,
                tenant_id=tenant_id
            )

            final_status = res.get('validation_status', 'VALIDATION_FAILED')
            is_failed = res.get('status') == 'FAILED' or final_status in ['ERROR', 'VALIDATION_FAILED']
            
            # Handle AI Rate Limits (Retryable)
            if is_failed and ('429' in str(res.get('error', '')) or res.get('code') == 'RATE_LIMIT'):
                raise Exception(f"AI Rate Limit: {res.get('error')}")

            # Cleanup lock on success/permanent failure
            redis_client.get_client().delete(task_lock_key)

            return {
                'item_id': item_id,
                'status': 'failed' if is_failed else 'success',
                'result_json': res.get('data') or {},
                'error_message': res.get('error') if is_failed else None
            }

        except Exception as e:
            attempt += 1
            if attempt <= MAX_RETRIES:
                backoff = (2 ** attempt) + random.uniform(0.5, 1.5)
                logger.warning(f"Retry {attempt}/{MAX_RETRIES} for item {item_id} in {backoff:.2f}s | Error: {e}")
                time.sleep(backoff)
                continue
            
            logger.error(f"Worker exhausted retries for item {item_id}: {e}")
            return {
                'item_id': item_id,
                'status': 'failed',
                'error_message': f"Exhausted {MAX_RETRIES} retries. Last error: {str(e)}"
            }
        finally:
            db.connections.close_all()

def process_bulk_job(job_id: int, voucher_type: str = 'Purchase'):
    """
    Processes a bulk job by distributing page-level tasks.
    """
    logger.info(f"Processing Bulk Job {job_id}")
    try:
        job = BulkInvoiceJob.objects.get(id=job_id)
        job.status = 'processing'
        job.save()

        items = job.items.filter(parent_item_id=None)
        item_ids = [it.id for it in items]
        
        results = []
        # Run with ProcessPoolExecutor
        # max_workers=2 to keep system responsive, 
        # horizontal scaling happens via multiple worker scripts/machines
        with concurrent.futures.ProcessPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(
                    worker, 
                    iid, 
                    job.id, 
                    voucher_type, 
                    getattr(job, 'upload_session_id', None) or str(job.id),
                    str(job.tenant_id)
                ) for iid in item_ids
            ]
            
            for future in concurrent.futures.as_completed(futures):
                try:
                    res = future.result()
                    if res['status'] == 'skipped': continue
                    
                    results.append(res)
                    
                    # IMMEDIATE DB UPDATE (Avoid hangs in UI progress)
                    with transaction.atomic():
                        InvoiceProcessingItem.objects.filter(id=res['item_id']).update(
                            status=res['status'],
                            result_json=res.get('result_json', {}),
                            error_message=res.get('error_message'),
                            updated_at=time.time()
                        )
                    
                    logger.info(f"Job {job_id}: Item {res['item_id']} {res['status']}. Progress {len(results)}/{len(item_ids)}")
                except Exception as fe:
                    logger.error(f"Future error in Job {job_id}: {fe}")

        # Final Job Status
        job.status = 'completed'
        job.save()
        logger.info(f"Bulk Job {job_id} Completed. Processed {len(results)} items.")

    except BulkInvoiceJob.DoesNotExist:
        logger.error(f"Job {job_id} not found.")
    except Exception as e:
        logger.error(f"Job {job_id} processor crashed: {e}")
        BulkInvoiceJob.objects.filter(id=job_id).update(status='failed')
    finally:
        connection.close()
