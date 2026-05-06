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
from ocr_pipeline.pipeline import run_ocr_pipeline
from core.ai_proxy import process_ai_request
from vouchers.pipeline import storage
logger.info("Project components imported.")

class BaseWorker:
    def __init__(self, queue_name: Any):
        # queue_name can be a string or a list of strings (for priorities)
        self.queue_names = [queue_name] if isinstance(queue_name, str) else queue_name
        self.running = True
        
        self.last_metrics_log = 0
        self.worker_id = f"{self.__class__.__name__}-{threading.get_ident()}"
        
        # Signal handling for graceful shutdown
        try:
            signal.signal(signal.SIGINT, self.stop)
            signal.signal(signal.SIGTERM, self.stop)
        except ValueError:
            # Signal only works in main thread
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
                # Use RAW multi-queue BRPOP (blocks for 'timeout' seconds)
                # This replaces the manual loop to prevent CPU spin and log spam.
                # ── HEARTBEAT & METRICS ──
                redis_client.record_heartbeat(self.worker_id)
                if time.time() - self.last_metrics_log > 30:
                    redis_client.log_metrics()
                    self.last_metrics_log = time.time()

                task = redis_client.pop_reliable(self.queue_names, timeout=5)
                
                if task:
                    task_id = task.get('id', 'unknown')
                    logger.info(f"[*] Picked up task {task_id}")
                    
                    # ── DB SAFETY ──
                    close_old_connections()

                    self.process_task(task)
                    
                    logger.info(f"[*] Task {task_id} processing complete.")
                else:
                    # BRPOP timed out silently (normal idle state)
                    time.sleep(0.1)
                    
            except Exception:
                logger.exception(f"CRITICAL: Worker loop failure in {self.queue_names}")
                time.sleep(5) # Backoff on unexpected error

    def process_task(self, task: Dict[str, Any]):
        raise NotImplementedError()

class OCRWorker(BaseWorker):
    def __init__(self):
        super().__init__("ocr_queue")

    def process_task(self, task: Dict[str, Any]):
        item_id = task.get('item_id')
        job_id = task.get('job_id')
        tenant_id = task.get('tenant_id')
        session_id = task.get('upload_session_id')
        
        logger.info(f"[TRACE] OCR_START | job_id={job_id} | item_id={item_id} | session_id={session_id}")
        logger.info(f"[OCR START] Item {item_id} | Job {job_id} | Tenant {tenant_id}")
        
        try:
            item = InvoiceProcessingItem.objects.get(id=item_id)
            item.status = 'processing'
            item.save()

            # 1. Download
            logger.info(f"[OCR] Downloading {item.file_path}")
            file_bytes = storage.download_bytes(item.file_path)
            
            # 2. Run Pipeline (OCR + Initial Validation)
            from ocr_pipeline.repository import StagingRepository
            repo = StagingRepository()
            
            file_hash = item.file_hash
            current_session = task.get('upload_session_id')
            
            existing_record = repo.find_by_hash_and_tenant(file_hash, tenant_id)
            record = None

            if existing_record:
                logger.error(f"[TRACE] worker.lookup_hit | record_id={existing_record.id} | session={existing_record.upload_session_id} | py_id={id(existing_record)}")
                if existing_record.upload_session_id == current_session:
                    # SAME SESSION: Direct reuse
                    record = existing_record
                    logger.info(f"[STAGING REUSE] Using existing record {record.id} for current session")
                else:
                    # DIFFERENT SESSION: CLONE (Requirement 3 - Option A)
                    logger.info(f"[DEDUPE HIT] Found existing OCR data in Record {existing_record.id} (Session: {existing_record.upload_session_id})")
                    logger.info(f"[CLONING RECORD] Creating fresh staging row for New Session: {current_session}")
                    
                    record = repo.create_record(
                        file_hash, 
                        os.path.basename(item.file_path), 
                        task.get('voucher_type', 'Purchase'), 
                        tenant_id, 
                        current_session
                    )
                    # Copy extracted data (Optimization)
                    record.extracted_data = existing_record.extracted_data
                    record.ocr_raw_text = existing_record.ocr_raw_text
                    record.supplier_invoice_no = existing_record.supplier_invoice_no
                    record.gstin = existing_record.gstin
                    record.branch = existing_record.branch
                    record.save()
                    logger.error(f"[TRACE] worker.clone_created | record_id={record.id} | session={record.upload_session_id} | py_id={id(record)}")
                    logger.info(f"[CLONE SUCCESS] New Record {record.id} created with reused OCR data | Session: {record.upload_session_id}")
            
            if not record:
                # NO RECORD AT ALL: Create fresh
                record = repo.create_record(
                    file_hash, 
                    os.path.basename(item.file_path), 
                    task.get('voucher_type', 'Purchase'), 
                    tenant_id, 
                    current_session
                )
                logger.info(f"[STAGING RECORD CREATED] ID: {record.id} | Session: {record.upload_session_id}")

            # ── HARD VALIDATION: SESSION OWNERSHIP ──
            if str(record.upload_session_id) != str(current_session):
                logger.critical(f"[SESSION CORRUPTION] Record {record.id} session ({record.upload_session_id}) DOES NOT MATCH task session ({current_session})")
                raise ValueError(f"Session ownership mismatch: {record.upload_session_id} != {current_session}")
            
            logger.info(f"[SESSION VERIFIED] Record {record.id} | Session: {record.upload_session_id}")

            record.status = 'OCR_PROCESSING'
            record.save(update_fields=['status'])
            logger.error(f"[TRACE] worker.before_pipeline | task_session={current_session} | record_id={record.id} | session={record.upload_session_id} | py_id={id(record)}")
            
            logger.info(f"[OCR] Calling Gemini for Item {item_id}")
            res = run_ocr_pipeline(file_bytes, record)
            logger.info(f"[TRACE] OCR_PIPELINE_COMPLETE | job_id={job_id} | item_id={item_id} | session_id={session_id} | record_id={record.id}")
            logger.info(f"[OCR DONE] Gemini returned result for Item {item_id}")
            
            # ── PHASE 1: EXTRACTION SUCCESS ──
            extraction_successful = False
            if isinstance(res, dict) and res.get('data'):
                extraction_successful = True
                logger.info(f"[EXTRACTION SUCCESS] Item {item_id} | Record {record.id}")
            else:
                logger.warning(f"[EXTRACTION FAILED] Item {item_id} | No data returned")

            # ── PHASE 2: VALIDATION / WORKFLOW RESULT ──
            val_res = res.get('validation', {})
            val_status = val_res.get('status', 'UNKNOWN')
            logger.info(f"[VALIDATION PHASE] Item {item_id} | Result: {val_status}")

            # ── FINAL STATUS ASSIGNMENT ──
            # Separation Requirement: extraction success != business success
            # If we extracted data, the OCR phase is a success.
            item.status = 'success' if extraction_successful else 'failed'
            item.result_json = res.get('data')
            
            if extraction_successful:
                item.error_message = None # Clear any previous error
            else:
                item.error_message = res.get('validation', {}).get('error') or "Extraction failed"

            item.save()

            logger.info(f"[TRACE] OCR_ITEM_FINISHED | job_id={job_id} | item_id={item_id} | status={item.status} | record_id={record.id}")
            logger.info(f"[OCR FINISHED] Item {item_id} | status={item.status} | val={val_status}")
            self._update_job_progress(job_id)

        except Exception as e:
            logger.error(f"[OCR FATAL ERROR] Item {item_id}: {e}")
            logger.error(traceback.format_exc())
            
            # ── EMERGENCY DB RECOVERY ──
            # Ensure we can save the failure status even if the connection was lost
            try:
                close_old_connections()
                InvoiceProcessingItem.objects.filter(id=item_id).update(status='failed', error_message=str(e))
                self._update_job_progress(job_id)
            except Exception as inner_db_err:
                logger.error(f"Failed to record OCR failure to DB: {inner_db_err}")

    def _update_job_progress(self, job_id):
        try:
            close_old_connections()
            with transaction.atomic():
                job = BulkInvoiceJob.objects.select_for_update().get(id=job_id)
                items = job.items.filter(parent_item_id=None)
                total = job.total_files # Use ground truth from job creation
                processed = items.filter(status__in=['success', 'failed']).count()
                
                logger.info(f"[TRACE] JOB_PROGRESS | job_id={job_id} | processed={processed} | total={total}")
                logger.info(f"[JOB PROGRESS] Job {job_id}: {processed}/{total} items done")
                
                if processed >= total and total > 0:
                    job.status = 'completed'
                    job.save()
                    logger.error(f"[TRACE] JOB_COMPLETE | job_id={job_id} | status=completed")
                    logger.info(f"[JOB COMPLETE] Job {job_id} marked as finished")
        except Exception as e:
            logger.error(f"Failed to update job progress for {job_id}: {e}")

class BulkJobWorker(BaseWorker):
    """Consumes the bulk_jobs queues (High, Normal, Low) and enqueues individual items for OCR"""
    def __init__(self):
        # Priority-aware queue list
        queues = ["bulk_jobs_high", "bulk_jobs_normal", "bulk_jobs_low"]
        super().__init__(queues)

    def process_task(self, task: Dict[str, Any]):
        job_id = task.get('job_id')
        session_id = task.get('upload_session_id')
        logger.info(f"[TRACE] BULK_EXPAND_START | job_id={job_id} | session_id={session_id}")
        logger.info(f"[BULK START] Expanding Job {job_id}")
        
        try:
            job = BulkInvoiceJob.objects.get(id=job_id)
            job.status = 'processing'
            job.save()
            
            items = job.items.filter(parent_item_id=None)
            logger.info(f"[BULK] Job {job_id} has {items.count()} items to process")
            
            for item in items:
                ocr_task = {
                    'item_id': item.id,
                    'job_id': job.id,
                    'tenant_id': task.get('tenant_id'),
                    'voucher_type': task.get('voucher_type'),
                    'upload_session_id': task.get('upload_session_id'),
                    'id': f"ocr_{item.id}"
                }
                redis_client.enqueue("ocr_queue", ocr_task)
                logger.info(f"[BULK EXPAND] Enqueued item {item.id} for Job {job_id} | Session: {ocr_task['upload_session_id']}")
                
            logger.info(f"[BULK FINISHED] Job {job_id} expansion complete.")
                
        except Exception as e:
            logger.error(f"[BULK ERROR] Job {job_id}: {e}")
            logger.error(traceback.format_exc())
            try:
                close_old_connections()
                BulkInvoiceJob.objects.filter(id=job_id).update(status='failed')
            except:
                pass

class AIWorker(BaseWorker):
    """Handles generic AI requests (Agent, Single Extraction) enqueued via AIProxy"""
    def __init__(self):
        # Mismatch fix: AIProxy enqueues to 'ai_requests', worker was listening to 'ai_queue'
        super().__init__("ai_requests")

    def process_task(self, task: Dict[str, Any]):
        task_id = task.get('id')
        request_data = task.get('request_data')
        
        logger.info(f"[AI START] Generic task {task_id}")
        
        try:
            # Execute the actual AI request (Gemini)
            result = process_ai_request(request_data)
            
            # ── DB RECONNECT ──
            close_old_connections()
            
            # Store result in Redis for polling
            result_key = f"ai_result:{task_id}"
            redis_client.get_client().setex(result_key, 3600, json.dumps(result)) # 1 hour TTL
            logger.info(f"[AI FINISHED] Task {task_id} stored in Redis")
            
        except Exception as e:
            logger.error(f"[AI ERROR] Task {task_id}: {e}")
            logger.error(traceback.format_exc())
            try:
                close_old_connections()
                error_res = {'error': str(e), 'status': 500}
                redis_client.get_client().setex(f"ai_result:{task_id}", 3600, json.dumps(error_res))
            except:
                pass

def start_workers():
    logger.info("Initializing worker threads...")
    
    threads = []
    
    # 1. Generic AI workers (Agent, single file)
    for i in range(2):
        t = threading.Thread(target=AIWorker().run, daemon=True, name=f"AIWorker-{i}")
        threads.append(t)
        
    # 2. OCR workers (Heavier processing)
    for i in range(3):
        t = threading.Thread(target=OCRWorker().run, daemon=True, name=f"OCRWorker-{i}")
        threads.append(t)
        
    # 3. Bulk Job expander (Metadata only)
    t = threading.Thread(target=BulkJobWorker().run, daemon=True, name="BulkJobWorker")
    threads.append(t)
    
    for t in threads:
        t.start()
        logger.info(f"Started thread: {t.name}")

    logger.info("--------------------------------------------------")
    logger.info("[WORKER ONLINE]")
    logger.info("Queue consumer active")
    logger.info("Active Queues:")
    logger.info("  * bulk_jobs_high / normal / low")
    logger.info("  * ocr_queue")
    logger.info("  * ai_requests")
    logger.info("--------------------------------------------------")
    logger.info("All worker threads are active. Monitoring queues...")
    
    try:
        while True:
            # Check thread health
            alive_count = sum(1 for t in threads if t.is_alive())
            if alive_count < len(threads):
                logger.warning(f"Thread health check: {alive_count}/{len(threads)} threads alive.")
            time.sleep(10)
    except KeyboardInterrupt:
        logger.info("Worker process stopped by user.")

if __name__ == "__main__":
    start_workers()
