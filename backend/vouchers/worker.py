import os
import sys
import json
import time
import logging
import signal
import threading
import traceback
from typing import Dict, Any, Optional, List

# 1. SETUP LOGGING FIRST (Crucial for visibility)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("worker.log")
    ]
)
logger = logging.getLogger("Worker")
logger.info("Worker process starting up...")

# 2. INITIALIZE DJANGO PROPERLY
try:
    logger.info("Initializing Django...")
    # Ensure the backend directory is in the path for imports
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(current_dir, '..'))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    logger.info("Calling django.setup()...")
    django.setup()
    logger.info("Django initialized successfully.")
except Exception as e:
    logger.critical(f"Failed to initialize Django: {e}")
    traceback.print_exc()
    sys.exit(1)

# Now safe to import models and core components
logger.info("Importing project components...")
from django.conf import settings
from django.db import connection, transaction, close_old_connections
from core.redis_client import redis_client
from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem, InvoiceOCRTemp
from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.pipeline import run_ocr_pipeline
from core.ai_proxy import process_ai_request
from vouchers.pipeline import storage
logger.info("Project components imported.")

class BaseWorker:
    def __init__(self, queue_name: Any):
        self.queue_names = [queue_name] if isinstance(queue_name, str) else queue_name
        self.running = True
        self.last_metrics_log = 0
        self.worker_id = f"{self.__class__.__name__}-{threading.get_ident()}"
        
        try:
            signal.signal(signal.SIGINT, self.stop)
            signal.signal(signal.SIGTERM, self.stop)
        except ValueError:
            pass

    def stop(self, *args):
        logger.info(f"Shutdown signal received for worker listening on {self.queue_names}")
        self.running = False

    def run(self):
        logger.info(f"Worker listener active for queues: {self.queue_names}")
        
        if not redis_client.available:
            logger.error("Redis is not available. Worker cannot start.")
            return

        while self.running:
            try:
                redis_client.record_heartbeat(self.worker_id)
                if time.time() - self.last_metrics_log > 30:
                    redis_client.log_metrics()
                    self.last_metrics_log = time.time()

                task = redis_client.pop_reliable(self.queue_names, timeout=5)
                
                if task:
                    task_id = task.get('id', 'unknown')
                    logger.info(f"[*] [{self.__class__.__name__}] Picked up task {task_id}")
                    
                    # ── HEARTBEAT THREAD ──
                    # Start a thread to keep the heartbeat alive during processing
                    stop_heartbeat = threading.Event()
                    def heartbeat_loop():
                        while not stop_heartbeat.is_set():
                            redis_client.update_task_heartbeat(task_id)
                            time.sleep(15)
                    
                    hb_thread = threading.Thread(target=heartbeat_loop, daemon=True)
                    hb_thread.start()

                    try:
                        close_old_connections()
                        self.process_task(task)
                        redis_client.complete_task(task)
                        logger.info(f"[*] [{self.__class__.__name__}] Task {task_id} done.")
                    except Exception as e:
                        # ── FATAL ESCAPE HATCH ──
                        # If an exception escapes process_task (bug in worker), we MUST log it
                        # and potentially ACK it to prevent infinite loops if retries are exhausted.
                        logger.error(f"[*] [{self.__class__.__name__}] FATAL ERROR in task {task_id}: {e}")
                        traceback.print_exc()
                        
                        # Increment retries even on fatal crash
                        retries = redis_client.increment_retry_count(task)
                        if retries > 5:
                            logger.critical(f"[*] [{self.__class__.__name__}] Task {task_id} reached MAX FATAL RETRIES. Dropping.")
                            redis_client.complete_task(task)
                        else:
                            # Let it stay in processing for RecoveryThread or manually retry
                            pass
                    finally:
                        stop_heartbeat.set()
                        hb_thread.join(timeout=1)
                else:
                    time.sleep(0.1)
            except Exception:
                logger.exception(f"CRITICAL: Worker loop failure in {self.queue_names}")
                time.sleep(5)

    def process_task(self, task: Dict[str, Any]):
        raise NotImplementedError()

class IngestionWorker(BaseWorker):
    """STAGE 1: Reads local temp files, hashes, and uploads to permanent storage"""
    def __init__(self):
        super().__init__("ingestion_queue")

    def process_task(self, task: Dict[str, Any]):
        job_id = task.get('job_id')
        file_info = task.get('file_info', [])
        tenant_id = task.get('tenant_id')
        
        logger.info(f"[INGESTION START] Job {job_id} | {len(file_info)} files")
        
        try:
            job = BulkInvoiceJob.objects.get(id=job_id)
            job.status = 'processing'
            job.save()

            for info in file_info:
                item_id = info['id']
                temp_path = info['temp_path']
                
                try:
                    # 1. Read and Hash (Streaming)
                    sha256 = hashlib.sha256()
                    with open(temp_path, 'rb') as f:
                        for chunk in iter(lambda: f.read(65536), b""):
                            sha256.update(chunk)
                    file_hash = sha256.hexdigest()
                    
                    # 2. Upload to Storage
                    key = storage.make_key(job_id, os.path.basename(temp_path))
                    with open(temp_path, 'rb') as f:
                        storage.upload_bytes(f.read(), key) 
                    
                    # 3. Update DB
                    item = InvoiceProcessingItem.objects.get(id=item_id)
                    item.file_path = key
                    item.file_hash = file_hash
                    item.status = 'pending'
                    item.save()
                    
                    # 4. Enqueue OCR
                    ocr_task = {
                        'item_id': item.id,
                        'job_id': job.id,
                        'tenant_id': tenant_id,
                        'voucher_type': task.get('voucher_type'),
                        'upload_session_id': task.get('upload_session_id'),
                        'id': f"ocr_{item.id}",
                        'retries': 0
                    }
                    redis_client.enqueue("ocr_queue", ocr_task)
                    logger.info(f"[INGESTION] Item {item_id} enqueued to OCR")
                except Exception as e:
                    logger.error(f"[INGESTION ERROR] Item {item_id}: {e}")
                    InvoiceProcessingItem.objects.filter(id=item_id).update(status='failed', error_message=str(e))
                finally:
                    # ALWAYS cleanup temp file
                    if os.path.exists(temp_path):
                        try: os.remove(temp_path)
                        except: pass

            # Cleanup temp directory if empty
            if file_info:
                temp_dir = os.path.dirname(file_info[0]['temp_path'])
                if temp_dir and os.path.exists(temp_dir) and not os.listdir(temp_dir):
                    try: os.rmdir(temp_dir)
                    except: pass

        except Exception as e:
            logger.error(f"[INGESTION FATAL] Job {job_id}: {e}")

class OCRWorker(BaseWorker):
    """STAGE 2: Downloads, splits, optimizes, and enqueues AI extraction tasks (Fire-and-Forget)"""
    def __init__(self):
        super().__init__("ocr_queue")

    def process_task(self, task: Dict[str, Any]):
        item_id = task.get('item_id')
        job_id = task.get('job_id')
        tenant_id = task.get('tenant_id')
        session_id = task.get('upload_session_id')
        
        try:
            item = InvoiceProcessingItem.objects.get(id=item_id)
            item.status = 'processing'
            item.save()

            file_bytes = storage.download_bytes(item.file_path)
            
            from ocr_pipeline.repository import StagingRepository
            repo = StagingRepository()
            
            # Create or reuse staging record
            record = repo.find_by_hash_and_tenant(item.file_hash, tenant_id)
            if not record or record.upload_session_id != session_id:
                record = repo.create_record(
                    item.file_hash, 
                    os.path.basename(item.file_path), 
                    task.get('voucher_type', 'Purchase'), 
                    tenant_id, 
                    session_id
                )

            record.status = 'OCR_PROCESSING'
            record.save()

            # ── NON-BLOCKING PIPELINE ──
            # We call run_ocr_pipeline with a flag to NOT wait for AI
            from ocr_pipeline.pipeline import run_ocr_pipeline
            res = run_ocr_pipeline(file_bytes, record, wait_for_ai=False, item_id=item_id)
            
            # If wait_for_ai=False, run_ocr_pipeline enqueues to ai_requests and returns
            # We mark the item as 'processing' (waiting for AI)
            item.status = 'processing'
            item.save()
            
            logger.info(f"[OCR STAGE DONE] Item {item_id} | AI tasks enqueued for {record.id}. Worker free.")

        except Exception as e:
            logger.error(f"[OCR ERROR] Item {item_id}: {e}")
            InvoiceProcessingItem.objects.filter(id=item_id).update(status='failed', error_message=str(e))

class AIWorker(BaseWorker):
    """STAGE 3: Consumes AI tasks, calls Gemini, and enqueues for Finalization"""
    def __init__(self):
        super().__init__("ai_requests")

    def process_task(self, task: Dict[str, Any]):
        task_id = task.get('id') # This is the ai_request UUID
        request_data = task.get('request_data')
        tenant_id = task.get('tenant_id')
        
        logger.info(f"[AI START] Task {task_id}")
        
        try:
            result = process_ai_request(request_data)
            
            # Result stored in Redis for any pollers (legacy support)
            result_key = f"ai_result:{task_id}"
            redis_client.get_client().setex(result_key, 3600, json.dumps(result))
            
            # ── TRIGGER FINALIZATION ──
            # The metadata MUST be propagated for finalization to find the DB records
            finalize_task = {
                'ai_task_id': task_id,
                'result': result,
                'metadata': request_data.get('metadata', {}), # FIX: Metadata is inside request_data
                'tenant_id': tenant_id or request_data.get('tenant_id'),
                'id': f"fin_{task_id}"
            }
            redis_client.enqueue("finalization_queue", finalize_task)
            logger.info(f"[AI STAGE DONE] Task {task_id} completed. Finalization enqueued.")

        except Exception as e:
            logger.error(f"[AI ERROR] Task {task_id}: {e}")

class FinalizationWorker(BaseWorker):
    """STAGE 4: Normalizes AI result, validates, and creates Voucher records"""
    def __init__(self):
        super().__init__("finalization_queue")

    def process_task(self, task: Dict[str, Any]):
        metadata = task.get('metadata', {})
        record_id = metadata.get('record_id')
        item_id = metadata.get('item_id')
        page_idx = metadata.get('page_index', 1)
        total_pages = metadata.get('total_pages', 1)
        ai_result = task.get('result', {})
        
        if not record_id:
            logger.error(f"[FINALIZATION ERROR] No record_id in metadata. Task: {task.get('id')}")
            return

        try:
            # 1. Parse Extracted Data
            reply = ai_result.get('reply')
            if reply and isinstance(reply, str):
                try:
                    extracted = json.loads(reply)
                except:
                    from core.ai_proxy import safe_extract_json
                    cleaned = safe_extract_json(reply)
                    extracted = json.loads(cleaned) if cleaned else ai_result
            else:
                extracted = ai_result.get('reply_json') or ai_result.get('data') or ai_result

            # 2. Atomic Update of Record
            from ocr_pipeline.pipeline import normalize, validate_and_process
            
            # ── DISTRIBUTED LOCK (Idempotency) ──
            # Prevent race conditions between retries or recovery false positives
            lock_key = f"lock:finalization:{record_id}"
            if not redis_client.get_client().set(lock_key, "1", nx=True, ex=300):
                logger.warning(f"[IDEMPOTENCY] Finalization for {record_id} already in progress. Skipping.")
                return

            try:
                with transaction.atomic():
                    record = InvoiceTempOCR.objects.select_for_update().get(id=record_id)
                    
                    if record.status == 'VOUCHER_CREATED':
                        logger.info(f"Record {record_id} already finalized. Skipping.")
                        return

                    # Normalize this page's result
                    normalized_page = normalize(extracted)
                
                # ── MERGE LOGIC ──
                    # ── PRESERVE PAGES (Safe Merging) ──
                    # Instead of blindly extending items, we store pages separately
                    # to allow the reconstruction layer to detect split invoices.
                    existing_data = record.extracted_data or {}
                    if '_pages' not in existing_data:
                        # Migrate legacy data if exists
                        existing_data['_pages'] = {}
                        if 'sections' in existing_data and 'items' in existing_data.get('sections', {}):
                             # Keep as page 1
                             existing_data['_pages']['1'] = existing_data.copy()

                    existing_data['_pages'][str(page_idx)] = normalized_page
                    
                    # Also maintain a 'summary' view for the UI (Page 1 + Aggregated Items)
                    if page_idx == 1 or not record.supplier_invoice_no:
                        for k, v in normalized_page.items():
                            if k != 'sections' and k != '_pages':
                                existing_data[k] = v
                                # ── SYNC TO TOP-LEVEL COLUMNS ──
                                if hasattr(record, k):
                                    setattr(record, k, v)
                        
                        # Explicitly sync supplier_details to columns if missing
                        supp = normalized_page.get('sections', {}).get('supplier_details', {})
                        if not record.gstin: record.gstin = supp.get('gstin')
                        if not record.supplier_invoice_no: record.supplier_invoice_no = supp.get('supplier_invoice_no')
                    
                    # Merge items for the 'preview' but the source of truth is now _pages
                    if 'sections' not in existing_data: existing_data['sections'] = {}
                    if 'items' not in existing_data['sections']: existing_data['sections']['items'] = []
                    
                    new_items = normalized_page.get('sections', {}).get('items', [])
                    existing_data['sections']['items'].extend(new_items)
                    
                    record.extracted_data = existing_data

                    record.status = 'EXTRACTED'
                    record.save()
                    
                    # ── COMPLETION TRACKING ──
                # Use Redis to track how many pages of this record are processed
                counter_key = f"pages_done:{record_id}"
                done_count = redis_client.get_client().incr(counter_key)
                redis_client.get_client().expire(counter_key, 3600) # 1 hour TTL
                
                if done_count >= total_pages:
                    logger.info(f"[FINALIZING] All {total_pages} pages received for Record {record_id}. Creating voucher.")
                    # Final step: Business Logic + DB Voucher Creation
                    res = validate_and_process(record, auto_save=True)
                    
                    # 3. Update parent Bulk Job progress
                    if not item_id:
                        item = InvoiceProcessingItem.objects.filter(
                            job__upload_session_id=record.upload_session_id, 
                            file_hash=record.file_hash
                        ).first()
                        item_id = item.id if item else None
                    
                    if item_id:
                        InvoiceProcessingItem.objects.filter(id=item_id).update(status='success')
                        item = InvoiceProcessingItem.objects.get(id=item_id)
                        self._update_job_progress(item.job_id)

                    redis_client.get_client().delete(counter_key)
            finally:
                # Always release lock
                redis_client.get_client().delete(lock_key)

            logger.info(f"[PIPELINE COMPLETE] Page {page_idx}/{total_pages} of Record {record_id} processed.")

        except Exception as e:
            logger.error(f"[FINALIZATION ERROR] Record {record_id} Page {page_idx}: {e}")
            # If we fail, we should check if we should retry or mark as FAILED
            retries = redis_client.increment_retry_count(task)
            if retries > 3:
                logger.critical(f"[FINALIZATION FATAL] Giving up on Record {record_id} after {retries} retries.")
                InvoiceTempOCR.objects.filter(id=record_id).update(status='FAILED', validation_status='ERROR', validation_message=f"Finalization failed after retries: {e}")
                if item_id:
                     InvoiceProcessingItem.objects.filter(id=item_id).update(status='failed', error_message=str(e))
                # Cleanup counter so it doesn't stay stuck
                redis_client.get_client().delete(f"pages_done:{record_id}")
            else:
                # Re-enqueue for retry with backoff
                time.sleep(min(30, 2 ** retries))
                redis_client.enqueue("finalization_queue", task)

    def _update_job_progress(self, job_id):
        # Same logic as before to update BulkInvoiceJob status
        try:
            with transaction.atomic():
                job = BulkInvoiceJob.objects.select_for_update().get(id=job_id)
                items = job.items.filter(parent_item_id=None)
                total = job.total_files
                processed = items.filter(status__in=['success', 'failed']).count()
                if processed >= total and total > 0:
                    job.status = 'completed'
                    job.save()
        except: pass

def start_workers():
    logger.info("Initializing worker threads (Production Hardened Pipeline)...")
    threads = []
    
    # ── STAGE 0: RECOVERY THREAD (Operational Safety) ──
    def recovery_loop():
        logger.info("Recovery thread active (Heartbeat-aware monitoring)...")
        queues = ['ingestion_queue', 'ocr_queue', 'ai_requests', 'finalization_queue']
        while True:
            try:
                # Recover tasks stuck in processing: queues ONLY if heartbeats are dead
                # Faster interval (30s) because heartbeats make it safe
                redis_client.recover_stale_tasks(queues)
                time.sleep(30) 
            except: time.sleep(10)

    rt = threading.Thread(target=recovery_loop, daemon=True, name="RecoveryThread")
    threads.append(rt)
    rt.start()

    # Distribution of threads based on stage weight
    worker_configs = [
        (IngestionWorker, 1),
        (OCRWorker, 2),
        (AIWorker, 4),
        (FinalizationWorker, 2)
    ]
    
    for worker_class, count in worker_configs:
        for i in range(count):
            t = threading.Thread(target=worker_class().run, daemon=True, name=f"{worker_class.__name__}-{i}")
            threads.append(t)
            t.start()
            logger.info(f"Started thread: {t.name}")

    try:
        while True:
            time.sleep(10)
    except KeyboardInterrupt:
        logger.info("Worker process stopped.")

if __name__ == "__main__":
    import hashlib
    start_workers()
