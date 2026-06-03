import os
import sys
import json
import time
import logging
import signal
import threading
import traceback
import hashlib
import socket
import multiprocessing
import queue
from typing import Dict, Any, Optional, List

# 1. SETUP LOGGING FIRST
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("worker.log")
    ]
)
logger = logging.getLogger("Worker")

# ── WORKER RESOURCE LIMITS ──
MAX_PAGES_LIMIT = int(os.getenv('MAX_PAGES_PER_JOB', '100'))
OCR_TIMEOUT_SEC = int(os.getenv('OCR_TIMEOUT_SEC', '1800'))  
MEMORY_LIMIT_MB = int(os.getenv('MEMORY_LIMIT_MB', '2048'))

def _isolated_wrapper(q, func, *f_args):
    """Module-level wrapper for picklability in multiprocessing."""
    try:
        import resource
        mem_bytes = MEMORY_LIMIT_MB * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
    except (ImportError, ValueError):
        pass
    
    try:
        from django.db import connections
        for conn in connections.all():
            conn.close()
        
        res = func(*f_args)
        q.put({'success': True, 'data': res})
    except Exception as e:
        q.put({'success': False, 'error': str(e), 'trace': traceback.format_exc()})

class ResourceGuard:
    """Isolates heavy processing into a separate process with limits."""
    @staticmethod
    def run_isolated(func, args, timeout=OCR_TIMEOUT_SEC):
        ctx = multiprocessing.get_context('spawn')
        result_queue = ctx.Queue()

        p = ctx.Process(target=_isolated_wrapper, args=(result_queue, func, *args))
        p.start()
        
        try:
            res_data = result_queue.get(timeout=timeout)
            p.join(5)
            if p.is_alive(): p.terminate()
            return res_data
        except queue.Empty:
            logger.error(f"[RESOURCE_GUARD] Task timed out after {timeout}s. Terminating process {p.pid}")
            p.terminate()
            p.join()
            return {'success': False, 'error': f'TIMEOUT: Task exceeded {timeout}s'}
        except Exception as e:
            if p.is_alive(): p.terminate()
            return {'success': False, 'error': str(e)}

class WorkerLockManager:
    """Ensures only one instance of the worker runtime is active on the cluster."""
    LOCK_KEY = "worker_runtime_lock"
    LOCK_TTL = 60
    HEARTBEAT_INTERVAL = 30

    def __init__(self):
        self.hostname = socket.gethostname()
        self.pid = os.getpid()
        self.worker_info = f"{self.hostname}:{self.pid}:{time.time()}"
        self.active = False
        self._hb_thread = None

    def acquire(self) -> bool:
        from core.redis_client import redis_client
        client = redis_client.get_client()
        if not client: return False

        if client.set(self.LOCK_KEY, self.worker_info, nx=True, ex=self.LOCK_TTL):
            self.active = True
            logger.info(f"[WORKER_SINGLETON_ACQUIRED] info={self.worker_info}")
            self._start_heartbeat()
            return True

        existing = client.get(self.LOCK_KEY)
        if existing:
            try:
                parts = str(existing).split(':')
                if parts[0] == self.hostname:
                    try:
                        os.kill(int(parts[1]), 0)
                        return False
                    except (OSError, ValueError):
                        client.set(self.LOCK_KEY, self.worker_info, ex=self.LOCK_TTL)
                        self.active = True
                        self._start_heartbeat()
                        return True
            except: pass
        return False

    def _start_heartbeat(self):
        def hb():
            from core.redis_client import redis_client
            while self.active:
                try: redis_client.get_client().expire(self.LOCK_KEY, self.LOCK_TTL)
                except: pass
                time.sleep(self.HEARTBEAT_INTERVAL)
        self._hb_thread = threading.Thread(target=hb, daemon=True)
        self._hb_thread.start()

    def release(self):
        self.active = False
        from core.redis_client import redis_client
        try: redis_client.get_client().delete(self.LOCK_KEY)
        except: pass

global_lock_manager = WorkerLockManager()

# 2. INITIALIZE DJANGO
try:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(current_dir, '..'))
    if project_root not in sys.path: sys.path.insert(0, project_root)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()
except Exception as e:
    logger.critical(f"Failed to initialize Django: {e}")
    sys.exit(1)

# SAFE IMPORTS
from core.constants import JobStatus, ItemStatus
from django.db import transaction, close_old_connections
from core.redis_client import redis_client
from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from ocr_pipeline.models import PipelineStatus, InvoiceTempOCR, SessionFinalizationState, InvoicePageResult
from ocr_pipeline.pipeline import run_ocr_pipeline, is_page_valid, assemble_multi_page_record
from ocr_pipeline.normalize import get_canonical_export_record
from core.ai_proxy import process_ai_request

from vouchers.pipeline import storage

class BaseWorker:
    def __init__(self, queue_name: Any):
        self.queue_names = [queue_name] if isinstance(queue_name, str) else queue_name
        self.running = True
        self.pid = os.getpid()
        self.worker_id = f"{self.__class__.__name__}-PID{self.pid}-{int(time.time())}"
        
        try:
            signal.signal(signal.SIGINT, self.stop)
            signal.signal(signal.SIGTERM, self.stop)
        except ValueError: pass

    def stop(self, *args):
        self.running = False

    def run(self):
        logger.info(f"Worker {self.worker_id} active for: {self.queue_names}")
        while self.running:
            task = None
            stop_hb = threading.Event()
            try:
                redis_client.record_heartbeat(self.worker_id)
                close_old_connections()
                
                task = redis_client.pop_reliable(self.queue_names, timeout=30, worker_id=self.worker_id)
                if not task: continue
                
                task_id = task.get('id', 'unknown')
                logger.info(f"[TASK_START] task={task_id} queue={task.get('_source_queue')}")
                
                # Dynamic task heartbeat
                def task_hb():
                    while not stop_hb.is_set():
                        try: redis_client.update_task_heartbeat(task_id)
                        except: pass
                        time.sleep(20)
                threading.Thread(target=task_hb, daemon=True).start()

                try:
                    t_start = time.time()
                    self.process_task(task)
                    exec_time = time.time() - t_start
                    logger.info(f"[TASK_SUCCESS] task={task_id} time={exec_time:.2f}s")
                except Exception as e:
                    logger.exception(f"[TASK_ERROR] task={task_id}: {e}")
                    retries = redis_client.increment_retry_count(task)
                    if retries > 5:
                        logger.critical(f"[TASK_FATAL] task={task_id} max retries exceeded. Moving to DLQ.")
                        redis_client.push_to_dlq(task.get('_source_queue'), task, str(e))
                        # INFORM PIPELINE OF PERMANENT FAILURE
                        self.handle_permanent_failure(task, str(e))
                    else:
                        # Standard re-enqueue (BaseWorker)
                        redis_client.enqueue(task.get('_source_queue'), task)
            except Exception as e:
                logger.error(f"[WORKER_LOOP_CRASH] {e}")
                time.sleep(2)
            finally:
                if task:
                    # ALWAYS ACK (atomic remove from processing queue)
                    redis_client.complete_task(task)
                stop_hb.set()

    def handle_permanent_failure(self, task: Dict[str, Any], error: str):
        """Optional hook for subclasses to update DB/Status on fatal errors."""
        pass


def update_job_progress(job_id):
    """Refreshes job metrics and sets terminal JobStatus.COMPLETED when all items are done."""
    try:
        with transaction.atomic():
            job = BulkInvoiceJob.objects.select_for_update().get(id=job_id)
            masters = job.items.filter(parent_item_id=None)
            total = job.total_files
            
            terminal_items = masters.filter(status__in=[JobStatus.COMPLETED, JobStatus.FAILED, ItemStatus.SKIPPED])
            success_count = masters.filter(status=JobStatus.COMPLETED).count()
            failed_count = masters.filter(status=JobStatus.FAILED).count()
            terminal_count = terminal_items.count()
            
            progress = int((terminal_count / total * 100)) if total > 0 else 100
            
            logger.info(f"[TELEMETRY] Job {job_id}: {progress}% | S:{success_count} F:{failed_count} T:{total}")

            if terminal_count >= total and total > 0:
                job.status = JobStatus.COMPLETED
                job.save()
                redis_client.decr_tenant_concurrency(job.tenant_id)
                logger.info(f"[TELEMETRY] JOB_COMPLETED: {job_id}")

            # Update Redis Cache for UI
            if redis_client.available:
                redis_client.get_client().hset(f"job:progress:{job_id}", mapping={
                    'status': job.status, 'progress': progress, 'total': total,
                    'processed': success_count, 'failed': failed_count, 'updated_at': time.time()
                })
                redis_client.get_client().expire(f"job:progress:{job_id}", 3600)
    except Exception as e:
        logger.error(f"[TELEMETRY_ERROR] Job {job_id}: {e}")

def check_session_completion(record_id, total_pages, page_idx, item_id=None):
    """[LEGACY] Deactivated to prevent redundant legacy assembly execution paths."""
    logger.info(f"[LEGACY_ASSEMBLY_BYPASS] check_session_completion called for record={record_id} page={page_idx} - skipping execution")
    return



class IngestionWorker(BaseWorker):
    def __init__(self): super().__init__("ingestion_queue")

    def process_task(self, task: Dict[str, Any]):
        job_id = task.get('job_id')
        files = task.get('file_info', [])
        job = BulkInvoiceJob.objects.get(id=job_id)
        job.status = JobStatus.PROCESSING
        job.save()

        for info in files:
            item_id = info['id']
            try:
                item = InvoiceProcessingItem.objects.get(id=item_id)
                item.status = ItemStatus.PROCESSING
                item.save()

                # Hash and Upload
                path = info['temp_path']
                with open(path, 'rb') as f: content = f.read()
                file_hash = hashlib.sha256(content).hexdigest()
                key = storage.make_key(job_id, os.path.basename(path))
                storage.upload_bytes(content, key)

                item.file_path = key
                item.file_hash = file_hash
                item.save()

                # Enqueue OCR
                ocr_task = {
                    'item_id': item.id, 'staging_record_id': info.get('staging_record_id'),
                    'job_id': job.id, 'tenant_id': job.tenant_id,
                    'upload_session_id': job.upload_session_id, 'id': f"ocr_{item.id}_{int(time.time())}"
                }
                redis_client.enqueue("ocr_queue", ocr_task)
                if os.path.exists(path): os.remove(path)
            except Exception as e:
                logger.error(f"[INGEST_ERR] item={item_id}: {e}")
                InvoiceProcessingItem.objects.filter(id=item_id).update(status=ItemStatus.FAILED)
                update_job_progress(job_id)

    def handle_permanent_failure(self, task: Dict[str, Any], error: str):
        job_id = task.get('job_id')
        if job_id:
            BulkInvoiceJob.objects.filter(id=job_id).update(status=JobStatus.FAILED)
            update_job_progress(job_id)


class OCRWorker(BaseWorker):
    def __init__(self): super().__init__("ocr_queue")

    def process_task(self, task: Dict[str, Any]):
        item_id = task.get('item_id')
        record_id = task.get('staging_record_id')
        
        item = InvoiceProcessingItem.objects.get(id=item_id)
        file_bytes = storage.download_bytes(item.file_path)
        
        from ocr_pipeline.repository import StagingRepository
        record = StagingRepository().find_by_id(record_id)
        record.status = PipelineStatus.PROCESSING
        record.save()

        # RUN OCR PIPELINE (Forces Async AI Queueing)
        ResourceGuard.run_isolated(run_ocr_pipeline, (file_bytes, record, False, item_id, task.get('job_id')))
        logger.info(f"[OCR_STAGE_DONE] record={record_id} AI tasks enqueued.")

    def handle_permanent_failure(self, task: Dict[str, Any], error: str):
        record_id = task.get('staging_record_id')
        item_id = task.get('item_id')
        if record_id:
            InvoiceTempOCR.objects.filter(id=record_id).update(status=PipelineStatus.FAILED)
            # INFORM BARRIER
            try:
                # Page count is unknown here, so we mark it failed in DB
                item = InvoiceProcessingItem.objects.get(id=item_id)
                item.status = JobStatus.FAILED
                item.save()
                update_job_progress(item.job_id)
            except: pass


class AIWorker(BaseWorker):
    def __init__(self): super().__init__("ai_requests")

    def process_task(self, task: Dict[str, Any]):
        metadata = task.get('request_data', {}).get('metadata', {})
        record_id = metadata.get('record_id')
        page_idx = metadata.get('page_index', 1)
        
        logger.info(f"[PAGE_LIFECYCLE] record={record_id} page={page_idx} STAGE='AI_START'")
        
        res = ResourceGuard.run_isolated(process_ai_request, (task.get('request_data'),))
        if not res.get('success'): raise RuntimeError(res.get('error'))
        
        result = res['data']
        # Preserve OCR text
        if '_pdf_ocr_text' in task.get('request_data'):
            result['_pdf_ocr_text'] = task.get('request_data')['_pdf_ocr_text']

        # Enqueue Finalization
        fin_task = {
            'ai_task_id': task.get('id'), 'result': result, 'metadata': metadata,
            'tenant_id': task.get('tenant_id'), 'id': f"fin_{task.get('id')}"
        }
        redis_client.enqueue("finalization_queue", fin_task)
        logger.info(f"[PAGE_LIFECYCLE] record={record_id} page={page_idx} STAGE='AI_COMPLETE'")

    def handle_permanent_failure(self, task: Dict[str, Any], error: str):
        metadata = task.get('request_data', {}).get('metadata', {})
        record_id = metadata.get('record_id')
        page_idx = metadata.get('page_index', 1)
        total_pages = metadata.get('total_pages', 1)
        session_id = metadata.get('upload_session_id')
        
        if record_id and session_id:
            terminal_key = f"terminal_pages_set:{session_id}_{record_id}"
            redis_client.get_client().sadd(terminal_key, page_idx)
            check_session_completion(record_id, total_pages, page_idx, metadata.get('item_id'))


class FinalizationWorker(BaseWorker):
    def __init__(self): super().__init__("finalization_queue")

    def process_task(self, task: Dict[str, Any]):
        metadata = task.get('metadata', {})
        record_id = metadata.get('record_id')
        page_idx = metadata.get('page_index', 1)
        total_pages = metadata.get('total_pages', 1)
        session_id = metadata.get('upload_session_id')
        
        logger.info(f"[SESSION_FORENSIC] stage='finalization_worker_receive' record={record_id} session={session_id} tenant={task.get('tenant_id')} page={page_idx}")
        
        finalized_key = f"finalized_pages_set:{session_id}_{record_id}"
        terminal_key = f"terminal_pages_set:{session_id}_{record_id}"

        try:
            if task.get('error'):
                logger.error(f"[AI_ERROR_PROPAGATED] record={record_id} page={page_idx}: {task['error']}")
                redis_client.get_client().sadd(terminal_key, page_idx)
                check_session_completion(record_id, total_pages, page_idx, metadata.get('item_id'))
                return

            result = task.get('result', {})
            tenant_id = task.get('tenant_id')
            canonical = get_canonical_export_record(result, tenant_id=tenant_id)
            
            if not is_page_valid(canonical)[0]:
                logger.warning(f"[PAGE_INVALID] record={record_id} page={page_idx}")

            # Persist to DB
            InvoicePageResult.objects.update_or_create(
                record_id=record_id, page_number=page_idx,
                defaults={'session_id': session_id, 'canonical_payload': canonical}
            )
            
            # Redis Storage for Assembly
            redis_client.get_client().set(f"page_data:{record_id}:{page_idx}", json.dumps(canonical), ex=7200)
            
            # Mark Terminal
            redis_client.get_client().sadd(finalized_key, page_idx)
            redis_client.get_client().sadd(terminal_key, page_idx)
            redis_client.get_client().expire(finalized_key, 7200)
            redis_client.get_client().expire(terminal_key, 7200)

            logger.info(f"[PAGE_LIFECYCLE] record={record_id} page={page_idx} STAGE='FINALIZED'")
            check_session_completion(record_id, total_pages, page_idx, metadata.get('item_id'))
            logger.info(f"[SESSION_FORENSIC] stage='finalization_worker_page_complete' record={record_id} session={session_id} tenant={tenant_id} page={page_idx}")

        except Exception as e:
            logger.exception(f"[FINALIZATION_ERR] {e}")
            raise

def worker_process_wrapper(worker_class, *args):
    from django import db
    db.connections.close_all()
    from core.redis_client import RedisClient, redis_client
    RedisClient._instance = None
    redis_client._init_connection()
    worker_class(*args).run()

def start_workers():
    if not global_lock_manager.acquire(): sys.exit(1)
    
    # Startup Recovery
    queues = ['ingestion_queue', 'ocr_queue', 'ai_requests', 'finalization_queue']
    try:
        redis_client.recover_stale_tasks(queues)
    except Exception as e:
        logger.error(f"[STARTUP_RECOVERY_ERROR] {e}")

    processes = []
    configs = [(IngestionWorker, 1), (OCRWorker, 2), (AIWorker, 4), (FinalizationWorker, 2)]
    
    for worker_class, count in configs:
        for i in range(count):
            p = multiprocessing.Process(target=worker_process_wrapper, args=(worker_class,), name=f"{worker_class.__name__}-{i}")
            p.start()
            processes.append(p)

    try:
        while True: time.sleep(10)
    except KeyboardInterrupt: pass
    finally:
        for p in processes: p.terminate()
        global_lock_manager.release()

if __name__ == "__main__":
    multiprocessing.freeze_support()
    try: multiprocessing.set_start_method("spawn", force=True)
    except RuntimeError: pass
    start_workers()
