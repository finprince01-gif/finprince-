import time
import json
import logging
import signal
import os
from django.core.management.base import BaseCommand
from django.db import transaction
from ocr_pipeline.models import OCRTask, OCRJob
from core.redis_client import redis_client
from core.storage import StorageService
from ocr_pipeline.service import process_invoice_upload
from django.db.models import F

logger = logging.getLogger("OCRWorker")

class Command(BaseCommand):
    help = "Redis-Only OCR Worker - Simplified & Reliable"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.running = True
        signal.signal(signal.SIGINT,  self._stop)
        signal.signal(signal.SIGTERM, self._stop)

    def _stop(self, *_):
        logger.info("[WORKER] Graceful shutdown requested.")
        self.running = False

    def handle(self, *args, **options):
        """
        Worker loop using RPOPLPUSH (pop_reliable) for Redis-only processing.
        """
        logger.info("[WORKER] Started. Redis-only mode enforced.")
        
        # ── STARTUP VALIDATION ──
        # If Redis is not reachable → crash app
        if not redis_client.is_healthy():
            logger.critical("[WORKER] Redis is not reachable. Crashing.")
            raise RuntimeError("CRITICAL: Redis connection failed on worker startup. No fallback allowed.")

        storage = StorageService()
        queue_name = "ocr_tasks"
        proc_queue = "ocr_processing"

        while self.running:
            try:
                # ── pop_reliable() ──
                # Use RPOPLPUSH pattern for reliability
                payload, raw_data = redis_client.pop_reliable(queue_name, proc_queue, timeout=20)
                
                if not payload:
                    continue

                task_id = payload.get('task_id')
                logger.info(f"[WORKER] Picked task {task_id}")

                self._process_task(storage, payload, proc_queue, raw_data)

            except Exception as e:
                logger.error(f"[WORKER] Loop error: {e}")
                time.sleep(5)

    def _process_task(self, storage, payload, proc_queue, raw_data):
        task_id = payload.get('task_id')
        tenant_id = payload.get('tenant_id')

        try:
            # ── STEP 1: Set status = PROCESSING ──
            with transaction.atomic():
                try:
                    task = OCRTask.objects.select_for_update().get(id=task_id)
                    if task.status in ('EXTRACTED', 'FAILED'):
                        logger.warning(f"[WORKER] Task {task_id} already in terminal state. Acknowledging.")
                        redis_client.ack_task(proc_queue, raw_data)
                        return
                    
                    task.status = 'PROCESSING'
                    task.save(update_fields=['status', 'updated_at'])
                except OCRTask.DoesNotExist:
                    logger.error(f"[WORKER] Task {task_id} not found in DB. Acknowledging.")
                    redis_client.ack_task(proc_queue, raw_data)
                    return

            # ── STEP 2: Run OCR pipeline ──
            file_url = payload.get('file_url')
            # Extract S3 key from URL (assuming standard S3 URL format)
            if ".amazonaws.com/" in file_url:
                s3_key = file_url.split('.amazonaws.com/')[-1]
            else:
                s3_key = file_url # Fallback for local/relative paths

            file_bytes = storage.get_file(s3_key)

            # Run actual OCR extraction
            result = process_invoice_upload(
                file_bytes=file_bytes,
                voucher_type=payload.get('voucher_type', 'PURCHASE'),
                file_name=task.file_name,
                upload_session_id=payload.get('upload_session_id'),
                tenant_id=tenant_id
            )
            result_id = result.get('id') if isinstance(result, dict) else None

            # ── STEP 3: On success: status = EXTRACTED, ack_task() ──
            with transaction.atomic():
                task.status = 'EXTRACTED'
                task.result_id = result_id
                task.save(update_fields=['status', 'result_id', 'updated_at'])

                # Update job counters
                OCRJob.objects.filter(id=task.job_id).update(processed_files=F('processed_files') + 1)
                
                # Refresh job to check completion
                job = OCRJob.objects.get(id=task.job_id)
                if job.processed_files + job.failed_files >= job.total_files:
                    job.status = 'EXTRACTED' if job.failed_files == 0 else 'PARTIAL'
                    job.save(update_fields=['status', 'updated_at'])

            redis_client.ack_task(proc_queue, raw_data)
            logger.info(f"[WORKER] Completed task {task_id}")

        except Exception as e:
            logger.error(f"[WORKER] Failed task {task_id}: {e}")
            
            # ── STEP 4: On failure: status = FAILED, ack_task() ──
            try:
                with transaction.atomic():
                    task = OCRTask.objects.get(id=task_id)
                    task.status = 'FAILED'
                    task.error_message = str(e)
                    task.save(update_fields=['status', 'error_message', 'updated_at'])
                    
                    OCRJob.objects.filter(id=task.job_id).update(failed_files=F('failed_files') + 1)
                    
                    job = task.job
                    if job.processed_files + job.failed_files >= job.total_files:
                        job.status = 'PARTIAL' if job.processed_files > 0 else 'FAILED'
                        job.save(update_fields=['status', 'updated_at'])
            except Exception as db_e:
                logger.error(f"[WORKER] DB update failed during failure handling: {db_e}")

            redis_client.ack_task(proc_queue, raw_data)
            logger.info(f"[WORKER] Failed task {task_id} marked in DB and acknowledged.")
