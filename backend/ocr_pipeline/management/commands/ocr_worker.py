"""
OCR Worker — Self-Consistent, Partition-Tolerant, Anti-Oscillating
Implements:
  1. Global anti-oscillating circuit breaker (read-twice, graduated HALF_OPEN)
  2. Partition-tolerant dual-check semaphore (local + global)
  3. Exactly-once execution via DB atomic lock (OCRProcessingLock)
  4. Jittered requeue (anti-thundering-herd)
  5. Periodic counter reconciliation watchdog
  6. Mode-aware coordinated backpressure
  7. Deterministic degradation modes
"""
import sys
print("\n" + "!"*80)
print("CRITICAL: THIS WORKER IS OBSOLETE AND HAS BEEN DECOMMISSIONED.")
print("USE 'python vouchers/worker.py' INSTEAD.")
print("!"*80 + "\n")
sys.exit(1)

import time
import json
import random
import logging
import signal
import os
import threading
from django.core.management.base import BaseCommand
from django.db import transaction, IntegrityError
from ocr_pipeline.models import OCRTask, OCRJob, InvoiceTempOCR, OCRProcessingLock
from core.sqs import QueueService
from core.storage import StorageService
from core.redis_client import redis_client
from ocr_pipeline.service import process_invoice_upload
from django.db.models import F, Count

logger = logging.getLogger("OCRWorker")

# ── STATIC CONFIGURATION ──────────────────────────────────────────────────────
SAFE_LIMIT       = int(os.getenv('GEMINI_SAFE_LIMIT', 50))
POLL_WAIT_TIME   = 20          # SQS long-poll seconds
MAX_RETRIES      = 3
HEARTBEAT_SECS   = 25          # SQS visibility extension interval
FAIR_WAIT_BASE   = 30          # Base seconds before fairness requeue
FAIR_WAIT_JITTER = 20          # Random jitter added to FAIR_WAIT_BASE (anti-herd)
RECONCILE_EVERY  = 60          # Seconds between counter reconciliation runs


class Command(BaseCommand):
    help = "Self-Consistent OCR Worker (Coordination Layer v3)"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.running = True
        self._last_reconcile = 0
        signal.signal(signal.SIGINT,  self._stop)
        signal.signal(signal.SIGTERM, self._stop)

    def _stop(self, *_):
        logger.info("[WORKER] Graceful shutdown requested.")
        self.running = False

    # ── MAIN LOOP ─────────────────────────────────────────────────────────────
    def handle(self, *args, **options):
        logger.info(f"[WORKER] Started. SAFE_LIMIT={SAFE_LIMIT}")
        queue   = QueueService()
        storage = StorageService()

        while self.running:
            # ── COUNTER RECONCILIATION WATCHDOG ──
            self._maybe_reconcile()

            # ── MODE-AWARE INTAKE CONTROL ──
            state = redis_client.get_global_state()
            mode  = state.get('mode', 'NORMAL')
            if mode == 'PROTECTIVE':
                logger.warning("[WORKER] PROTECTIVE mode — suspending intake for 15s.")
                time.sleep(15)
                continue
            if mode == 'DEGRADED':
                time.sleep(3)  # Slow intake in degraded mode

            try:
                messages = queue.receive(max_messages=1, wait_time=POLL_WAIT_TIME)
                if not messages:
                    continue
                for msg in messages:
                    self._handle_message(queue, storage, msg)
            except Exception as e:
                logger.error(f"[WORKER] Loop error: {e}")
                time.sleep(5)

    # ── MESSAGE DISPATCH ──────────────────────────────────────────────────────
    def _handle_message(self, queue, storage, msg):
        try:
            body = json.loads(msg['Body'])
            self._process_task(queue, storage, body, msg['ReceiptHandle'])
        except Exception as e:
            logger.error(f"[WORKER] Message parse error: {e}")
            queue.delete(msg['ReceiptHandle'])

    # ── CORE TASK PROCESSING ─────────────────────────────────────────────────
    def _process_task(self, queue, storage, body, receipt_handle):
        task_id   = body.get('task_id')
        tenant_id = body.get('tenant_id')

        # ── STEP 1: GLOBAL CIRCUIT BREAKER (anti-oscillating, read-twice) ──
        cb_state, _, is_blocking = redis_client.get_circuit_breaker_state("gemini_api")
        if is_blocking:
            logger.warning(f"[CB] {cb_state} — deferring task {task_id}")
            self._revert_and_defer(queue, task_id, receipt_handle)
            return

        # ── STEP 2: ATOMIC TASK CLAIM (race-safe idempotency) ──
        try:
            with transaction.atomic():
                task = OCRTask.objects.select_for_update(nowait=True).get(id=task_id)
                if task.status in ('COMPLETED', 'PROCESSING'):
                    queue.delete(receipt_handle)
                    return
                task.status = 'PROCESSING'
                task.save(update_fields=['status', 'updated_at'])
        except Exception as e:
            logger.warning(f"[CLAIM] Task {task_id} already locked/missing: {e}")
            return

        # ── STEP 3: PARTITION-TOLERANT SEMAPHORE (dual-check + jitter) ──
        start_wait  = time.time()
        fair_wait   = FAIR_WAIT_BASE + random.uniform(0, FAIR_WAIT_JITTER)  # Anti-herd jitter
        acquired    = False

        while not redis_client.acquire_semaphore("gemini_api", SAFE_LIMIT, ttl=90):
            waited = time.time() - start_wait
            if waited > fair_wait:
                logger.info(f"[FAIR] Task {task_id} waited {waited:.1f}s. Deferring with jitter.")
                self._revert_and_defer(queue, task_id, receipt_handle)
                return
            # Re-check breaker while waiting (avoid stale check at loop entry)
            _, _, still_blocking = redis_client.get_circuit_breaker_state("gemini_api")
            if still_blocking:
                self._revert_and_defer(queue, task_id, receipt_handle)
                return
            time.sleep(2 + random.uniform(0, 3))  # Jittered sleep — prevents sync
        acquired = True

        # ── STEP 4: HEARTBEAT (prevents SQS re-delivery mid-processing) ──
        stop_hb = threading.Event()
        def _heartbeat():
            while not stop_hb.wait(HEARTBEAT_SECS):
                queue.change_visibility(receipt_handle, timeout=60)
        hb = threading.Thread(target=_heartbeat, daemon=True)
        hb.start()

        try:
            file_hash = task.file_hash

            # ── STEP 5: EXACTLY-ONCE EXECUTION GATE (DB atomic lock) ──
            # Try to INSERT a processing lock. Unique constraint = atomicity.
            lock_created = False
            try:
                with transaction.atomic():
                    lock, lock_created = OCRProcessingLock.objects.get_or_create(
                        file_hash=file_hash,
                        tenant_id=tenant_id,
                        defaults={'task_id': task_id}
                    )
            except Exception as e:
                logger.error(f"[LOCK] get_or_create failed: {e}")

            if not lock_created:
                # Another worker already claimed this hash
                if lock.completed and lock.result_id:
                    # Reuse existing result — no Gemini call needed
                    logger.info(f"[DEDUP] Task {task_id} reusing result {lock.result_id} (lock not ours).")
                    self._finalize_task(task, lock.result_id, cb_state)
                    queue.delete(receipt_handle)
                    return
                else:
                    # Lock exists but not yet completed — another worker is processing
                    # Defer with jitter to avoid collision
                    logger.info(f"[DEDUP] Task {task_id} in-flight elsewhere. Deferring.")
                    self._revert_and_defer(queue, task_id, receipt_handle, timeout=15)
                    return

            # ── STEP 6: EXECUTE OCR (Gemini API call) ──
            file_url = body.get('file_url')
            s3_key   = file_url.split('.amazonaws.com/')[-1]
            file_bytes = storage.get_file(s3_key)

            result = process_invoice_upload(
                file_bytes=file_bytes,
                voucher_type=body.get('voucher_type', 'PURCHASE'),
                file_name=task.file_name,
                upload_session_id=body.get('upload_session_id'),
                tenant_id=tenant_id
            )
            result_id = result.get('id') if isinstance(result, dict) else None

            # Update lock as completed
            OCRProcessingLock.objects.filter(
                file_hash=file_hash, tenant_id=tenant_id
            ).update(completed=True, result_id=result_id)

            # ── STEP 7: ATOMIC COMPLETION ──
            self._finalize_task(task, result_id, cb_state)
            queue.delete(receipt_handle)
            logger.info(f"[DONE] Task {task_id} completed.")

        except Exception as e:
            logger.error(f"[FAIL] Task {task_id}: {e}")
            redis_client.record_cb_failure("gemini_api")
            OCRJob.objects.filter(id=task.job_id).update(failed_files=F('failed_files') + 1)
            self._handle_failure(queue, task, body, receipt_handle, str(e))
        finally:
            stop_hb.set()
            hb.join(timeout=1)
            if acquired:
                redis_client.release_semaphore("gemini_api")

    # ── HELPERS ───────────────────────────────────────────────────────────────
    def _finalize_task(self, task, result_id, cb_state):
        """Atomically marks task complete and updates job counters."""
        with transaction.atomic():
            task.status    = 'COMPLETED'
            task.result_id = result_id
            task.save(update_fields=['status', 'result_id', 'updated_at'])

            OCRJob.objects.filter(id=task.job_id).update(
                processed_files=F('processed_files') + 1,
            )
            job = OCRJob.objects.get(id=task.job_id)
            if job.processed_files + job.failed_files >= job.total_files:
                job.status = 'COMPLETED' if job.failed_files == 0 else 'PARTIAL'
                job.save(update_fields=['status', 'updated_at'])

        # Circuit breaker success signal (advances HALF_OPEN recovery)
        redis_client.record_cb_success("gemini_api")

    def _revert_and_defer(self, queue, task_id, receipt_handle, timeout=None):
        """
        Reverts task to PENDING and defers SQS message with jitter.
        The jitter prevents all workers from retrying at the same moment (anti-herd).
        """
        # Jittered visibility timeout prevents thundering herd on re-delivery
        jitter_timeout = timeout or int(30 + random.uniform(0, 30))
        try:
            OCRTask.objects.filter(id=task_id).update(status='PENDING')
        except Exception: pass
        queue.change_visibility(receipt_handle, timeout=jitter_timeout)

    def _handle_failure(self, queue, task, body, receipt_handle, error_msg):
        attempt = body.get('attempt', 1)
        if attempt < MAX_RETRIES:
            # Exponential backoff with full jitter
            delay   = (2 ** attempt) + random.uniform(0, 2 ** attempt)
            time.sleep(delay)
            body['attempt'] = attempt + 1
            queue.push(body)
            queue.delete(receipt_handle)
            logger.info(f"[RETRY] Task {task.id} → attempt {attempt + 1}")
        else:
            with transaction.atomic():
                task.status        = 'FAILED'
                task.error_message = error_msg
                task.save(update_fields=['status', 'error_message', 'updated_at'])
                job = task.job
                if job.processed_files + job.failed_files >= job.total_files:
                    job.status = 'PARTIAL' if job.processed_files > 0 else 'FAILED'
                    job.save(update_fields=['status', 'updated_at'])
            queue.delete(receipt_handle)
            logger.error(f"[DLQ] Task {task.id} exhausted retries → FAILED.")

    # ── COUNTER RECONCILIATION WATCHDOG ───────────────────────────────────────
    def _maybe_reconcile(self):
        """
        Periodically reconciles the Redis global counter against DB ground truth.
        Corrects drift caused by worker crashes, Redis restarts, or network partitions.
        """
        now = time.time()
        if now - self._last_reconcile < RECONCILE_EVERY:
            return
        self._last_reconcile = now
        try:
            actual = OCRTask.objects.filter(status='PROCESSING').count()
            redis_client.reconcile_concurrency("gemini_api", actual)
            logger.debug(f"[RECONCILE] actual_processing={actual}")
        except Exception as e:
            logger.warning(f"[RECONCILE] DB query failed: {e}")
