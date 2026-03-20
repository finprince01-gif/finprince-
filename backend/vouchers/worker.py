"""
worker.py – COMPATIBILITY SHIM
================================
The in-process queue + threading model has been replaced by
Celery + Redis distributed tasks (vouchers/tasks.py).

This file exists ONLY to prevent import errors from any remaining
references to the old workers. All real processing now happens
via Celery tasks.

To start the Celery workers, see: BULK_PROCESSING_RUNBOOK.md
"""
import logging
logger = logging.getLogger(__name__)

def start_workers():
    """DEPRECATED: Workers now start via Celery. This is a no-op."""
    logger.warning(
        "[WORKER SHIM] start_workers() called but Celery workers are used now. "
        "Please start workers with: celery -A backend worker -Q invoice_pages,invoice_files,invoice_merge -c 5 -l info"
    )

def enqueue_optimized_job(job_id: int):
    """DEPRECATED: Use tasks.segment_and_enqueue.apply_async() directly."""
    logger.warning(f"[WORKER SHIM] enqueue_optimized_job({job_id}) called. Delegating to Celery task.")
    from .tasks import segment_and_enqueue
    segment_and_enqueue.apply_async(args=[job_id], queue='invoice_files')
