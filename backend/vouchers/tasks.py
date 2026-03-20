"""
Distributed Invoice Processing Tasks
=====================================
Architecture: Upload API → Redis Queue → Celery Workers → DB/Cache

This replaces the fragile in-process PriorityQueue + threading model with a
proper distributed task pipeline that is:
  - Horizontally scalable (spin up more workers)
  - Crash-resistant (tasks re-queued on worker death)
  - Priority-ordered (1-page invoices processed before multi-page)
  - Tenant-isolated (per-tenant rate limits enforced)
  - Self-healing (Celery beat checks stuck tasks)
"""
import os
import time
import logging
import hashlib
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

MAX_RETRIES    = getattr(settings, 'BULK_MAX_RETRIES', 3)
STUCK_MINUTES  = getattr(settings, 'BULK_STUCK_THRESHOLD_MINUTES', 5)

# ─────────────────────────────────────────────
# TASK 1 – SEGMENT & ENQUEUE (runs once per upload)
# ─────────────────────────────────────────────
@shared_task(
    bind=True,
    queue='invoice_files',
    max_retries=2,
    default_retry_delay=10,
    acks_late=True,
)
def segment_and_enqueue(self, job_id: int):
    """
    Stage 1: Segment uploaded PDFs into 1-page tasks and dispatch them
    to the 'invoice_pages' Celery queue with correct priorities.
    Only runs once per job (segmentation_done guard).
    """
    from .models import BulkInvoiceJob, InvoiceProcessingItem
    try:
        job = BulkInvoiceJob.objects.get(id=job_id)

        if job.segmentation_done:
            print(f"[SEGMENT] Job {job_id} already segmented. Skipping.")
            return

        # Atomic flag – prevent parallel duplicate segmentation
        updated = BulkInvoiceJob.objects.filter(id=job_id, segmentation_done=False).update(
            segmentation_done=True
        )
        if not updated:
            print(f"[SEGMENT] Race condition: Job {job_id} already claimed by another worker.")
            return

        print(f"[SEGMENT] Starting segmentation for Job {job_id}")

        # Enqueue all pending page-level tasks with appropriate priority
        tasks = InvoiceProcessingItem.objects.filter(job=job, status='pending')\
                                   .exclude(parent_item_id=None, page_count__gt=1)

        count = 0
        for item in tasks:
            # Priority: 1-page (priority=1) processed before 3+ pages (priority=3)
            # Celery priority: lower number = higher priority
            celery_priority = min(item.page_count, 3)  # maps to 1, 2, or 3

            process_invoice_page.apply_async(
                args=[item.id],
                queue='invoice_pages',
                priority=celery_priority,
            )
            count += 1

        BulkInvoiceJob.objects.filter(id=job_id).update(status='processing')
        print(f"[SEGMENT] Dispatched {count} page tasks for Job {job_id}")

    except BulkInvoiceJob.DoesNotExist:
        logger.error(f"[SEGMENT] Job {job_id} not found")
    except Exception as exc:
        logger.error(f"[SEGMENT] Failed for Job {job_id}: {exc}")
        raise self.retry(exc=exc)


# ─────────────────────────────────────────────
# TASK 2 – PROCESS SINGLE PAGE (core AI task)
# ─────────────────────────────────────────────
@shared_task(
    bind=True,
    queue='invoice_pages',
    max_retries=MAX_RETRIES,
    default_retry_delay=5,
    acks_late=True,
    time_limit=300,
    soft_time_limit=240,
)
def process_invoice_page(self, item_id: int):
    """
    Stage 2: Process a single invoice page through the AI pipeline.
    Each page is an independent task — parallel execution across workers.

    Flow: DB atomic claim → cache check → input validation → AI (with fallback)
          → save result → trigger merge check
    """
    from .models import InvoiceProcessingItem
    from django.db import connection
    connection.close()  # Ensure fresh connection for long-lived workers

    # ── Atomic Claim (prevent duplicate worker processing) ──────────────────
    updated = InvoiceProcessingItem.objects.filter(
        id=item_id, status='pending'
    ).update(status='processing', updated_at=timezone.now())

    if not updated:
        print(f"[SKIP] Item {item_id} already claimed by another worker or not pending")
        return

    try:
        item = InvoiceProcessingItem.objects.select_related('job').get(id=item_id)

        # ── Guard: max retries check ─────────────────────────────────────────
        if item.retry_count >= MAX_RETRIES:
            print(f"[LIMIT] Item {item_id}: max retries ({MAX_RETRIES}) reached. Marking FAILED.")
            _finalize_failure(item, f"Max retries ({MAX_RETRIES}) exhausted")
            return

        # ── Pre-AI: input validation ─────────────────────────────────────────
        if not _validate_input(item):
            print(f"[SKIP] Item {item_id} invalid (blank/missing file)")
            _finalize_failure(item, "Input validation failed: blank or missing file")
            return

        # ── Cache lookup ─────────────────────────────────────────────────────
        if item.file_hash:
            from core.ocr_cache import get_cached_ocr
            cached = get_cached_ocr(item.file_hash, item.job.tenant_id)
            if cached and cached.get('extracted_data'):
                print(f"[CACHE HIT] Item {item_id}: reusing cached result")
                _finalize_success(item, cached['extracted_data'])
                return

        # ── AI Extraction ────────────────────────────────────────────────────
        print(f"[WORKER] Processing item {item_id} (Page {item.page_number}/{item.page_count})")
        result = _call_ai_with_fallback(item)
        _finalize_success(item, result)

    except SoftTimeLimitExceeded:
        logger.warning(f"[TIMEOUT] Item {item_id} hit soft time limit. Retrying...")
        try:
            item = InvoiceProcessingItem.objects.get(id=item_id)
            item.retry_count += 1
            item.status = 'pending'
            item.save()
        except Exception:
            pass
        raise self.retry(exc=Exception("SoftTimeLimitExceeded"), countdown=10)

    except Exception as exc:
        err_msg = str(exc)
        logger.error(f"[ERROR] Item {item_id}: {err_msg[:100]}")
        try:
            item = InvoiceProcessingItem.objects.get(id=item_id)
            item.retry_count += 1
            is_retryable = any(kw in err_msg.lower() for kw in [
                "timeout", "deadline", "connection", "rate limit", "503", "504", "429"
            ])
            if is_retryable and item.retry_count < MAX_RETRIES:
                # Exponential backoff capped at 60s
                delay = min(2 ** item.retry_count, 60)
                print(f"[RETRY] Item {item_id}, attempt {item.retry_count}. Retrying in {delay}s")
                item.status = 'pending'
                item.save()
                raise self.retry(exc=exc, countdown=delay)
            else:
                _finalize_failure(item, err_msg)
        except Exception as inner:
            logger.error(f"[CRITICAL] Failed to handle failure for item {item_id}: {inner}")


# ─────────────────────────────────────────────
# TASK 3 – MERGE CHECK (triggers after each page)
# ─────────────────────────────────────────────
@shared_task(
    bind=True,
    queue='invoice_merge',
    acks_late=True,
)
def check_and_merge_invoice(self, parent_item_id: int):
    """
    Stage 3: Check if all pages for a logical invoice are done.
    If yes, merge results. Supports PARTIAL success (some pages succeeded).
    """
    from .models import InvoiceProcessingItem
    try:
        with transaction.atomic():
            parent = InvoiceProcessingItem.objects.select_for_update().get(id=parent_item_id)
            children = InvoiceProcessingItem.objects.filter(parent_item_id=parent.id)

            total_child = parent.page_count
            done_child = children.filter(status__in=['success', 'failed']).count()

            if done_child < total_child:
                return  # Not all pages done yet

            success_child = children.filter(status='success').count()
            failed_child = children.filter(status='failed').count()

            print(f"[MERGE] Invoice {parent_item_id}: {success_child} success, {failed_child} failed out of {total_child} pages")

            merged = _merge_results(children.order_by('page_number'))
            parent.result_json = merged

            if success_child == total_child:
                parent.status = 'success'
            elif success_child > 0:
                parent.status = 'partial'
                print(f"[PARTIAL] Invoice {parent_item_id} has partial data ({success_child}/{total_child} pages)")
            else:
                parent.status = 'failed'

            parent.save()

            if success_child > 0:
                _trigger_global_actions(parent, merged)

        _update_job_status(parent.job_id)

    except Exception as exc:
        logger.error(f"[MERGE ERROR] Parent {parent_item_id}: {exc}")


# ─────────────────────────────────────────────
# TASK 4 – SELF-HEALING (Celery Beat periodic)
# ─────────────────────────────────────────────
@shared_task(queue='invoice_files')
def recover_stuck_items():
    """
    Periodic task (run via Celery Beat every 5 min):
    Re-queues tasks stuck in PROCESSING for > STUCK_MINUTES.
    Prevents "ghost processing" from crashed workers.
    """
    from .models import InvoiceProcessingItem
    from django.db import connection
    connection.close()

    stalled_threshold = timezone.now() - timezone.timedelta(minutes=STUCK_MINUTES)
    stuck = InvoiceProcessingItem.objects.filter(
        status='processing',
        updated_at__lt=stalled_threshold
    ).exclude(parent_item_id=None, page_count__gt=1)

    count = 0
    for item in stuck:
        print(f"[REQUEUE] Stuck item {item.id} (stalled in PROCESSING for >{STUCK_MINUTES}min)")
        item.status = 'pending'
        item.save()
        priority = min(item.page_count, 3)
        process_invoice_page.apply_async(args=[item.id], queue='invoice_pages', priority=priority)
        count += 1

    if count:
        print(f"[REQUEUE] Recovered {count} stuck tasks")
    return count


# ─────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────
def _validate_input(item) -> bool:
    if not item.file_path or not os.path.exists(item.file_path):
        return False
    size_kb = os.path.getsize(item.file_path) / 1024
    return size_kb >= 1  # Reject blank/empty files

def _call_ai_with_fallback(item):
    """AI call with model fallback and mandatory throttle gap."""
    from .extraction_logic import perform_ocr_extraction
    ext = os.path.splitext(item.file_path)[1].lower()
    mime_type = 'application/pdf' if ext == '.pdf' else 'image/jpeg'

    with open(item.file_path, 'rb') as f:
        file_bytes = f.read()

    # Global AI call gap throttle (configurable)
    gap = getattr(settings, 'BULK_AI_CALL_GAP_SECONDS', 0.5)
    time.sleep(gap)

    # Attempt 1: Default model (Gemini Flash)
    try:
        return perform_ocr_extraction(file_bytes, mime_type)
    except Exception as e:
        err = str(e).lower()
        if any(kw in err for kw in ["timeout", "deadline", "quota", "rate"]):
            print(f"[FALLBACK] Primary model failed for item {item.id}: {str(e)[:60]}. Trying fallback...")
            time.sleep(5)
            # Attempt 2: Retry (ai_proxy already has model fallback internally)
            return perform_ocr_extraction(file_bytes, mime_type)
        raise

def _finalize_success(item, result):
    item.result_json = result
    item.status = 'success'
    item.save()
    print(f"[SUCCESS] Item {item.id} completed (page {item.page_number})")

    if item.parent_item_id:
        # Schedule merge check asynchronously
        check_and_merge_invoice.apply_async(args=[item.parent_item_id], queue='invoice_merge')
    else:
        _trigger_global_actions(item, result)
        _update_job_status(item.job_id)

def _finalize_failure(item, error_msg: str):
    item.status = 'failed'
    item.error_message = str(error_msg)[:500]
    item.save()
    print(f"[FAILED] Item {item.id}: {error_msg[:60]}")

    if item.parent_item_id:
        check_and_merge_invoice.apply_async(args=[item.parent_item_id], queue='invoice_merge')

    _update_job_status(item.job_id)

def _trigger_global_actions(item, result):
    if not result or not item.file_hash:
        return
    try:
        from core.ocr_cache import save_ocr_cache
        from core.processing_engine import run_invoice_processing_pipeline
        save_ocr_cache(item.file_hash, item.job.tenant_id, item.file_path, result, 'PENDING')
        run_invoice_processing_pipeline(item.file_hash, item.job.tenant_id)
    except Exception as e:
        logger.warning(f"[PIPELINE] Trigger failed for item {item.id}: {e}")

def _merge_results(sibling_items):
    final = {"invoice": {}, "items": []}
    for item in sibling_items:
        data = item.result_json or {}
        if item.page_number == 1 and data.get("invoice"):
            final["invoice"] = data["invoice"]
        page_items = data.get("items", [])
        if isinstance(page_items, list):
            final["items"].extend(page_items)
    return final

def _update_job_status(job_id: int):
    from .models import BulkInvoiceJob
    try:
        with transaction.atomic():
            job = BulkInvoiceJob.objects.select_for_update().get(id=job_id)
            tasks = job.items.exclude(parent_item_id=None, page_count__gt=1)
            done = tasks.filter(status__in=['success', 'failed']).count()

            if done >= job.total_files:
                job.status = 'completed'
                job.processed_count = tasks.filter(status='success').count()
                job.failed_count = tasks.filter(status='failed').count()
                job.save()
                print(f"[JOB COMPLETE] Job {job_id}: {job.processed_count} success, {job.failed_count} failed")
            else:
                job.save()
    except Exception as e:
        logger.error(f"[JOB STATUS] Failed for job {job_id}: {e}")
