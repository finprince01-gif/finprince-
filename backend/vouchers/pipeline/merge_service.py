"""
Merge Service – Hardened with Atomic DB Counter
================================================
Changes from v1:
  - Atomic page counter via F() expressions (safe for 50+ parallel workers)
  - No race condition on "all pages done" check
  - Merge is idempotent (double-finalize does no harm)
  - Total and line-item validation flags issues without blocking

Consumes:  invoice.ai    { job_id, page_number, page_count, result, ... }
Produces:  invoice.complete { job_id, item_id, status }
"""
import os
import sys
import asyncio
import logging
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from . import kafka_client

logger = logging.getLogger(__name__)


async def handle_ai_event(payload: dict):
    from django.db import connection
    connection.close()

    job_id      = payload['job_id']
    item_id     = payload.get('item_id')
    page_number = payload.get('page_number', 1)
    page_count  = payload.get('page_count', 1)
    result      = payload.get('result') or {}
    skipped     = payload.get('skipped', False)
    page_key    = payload.get('page_key', '')
    page_hash   = payload.get('page_hash')
    tenant_id   = payload.get('tenant_id', '')

    logger.info(f"[MERGE] Job {job_id} page {page_number}/{page_count}")

    try:
        from vouchers.models import InvoiceProcessingItem, BulkInvoiceJob
        from django.db import transaction
        from django.db.models import F
        from django.utils import timezone

        # 1. Upsert per-page result record
        page_status = 'skipped' if skipped else 'success'
        page_item, _ = InvoiceProcessingItem.objects.update_or_create(
            job_id=job_id,
            parent_item_id=item_id,
            page_number=page_number,
            defaults={
                'file_path':  page_key,
                'file_hash':  page_hash,
                'page_count': page_count,
                'status':     page_status,
                'result_json': result,
            }
        )

        # 2. Single-page invoice (no parent): finalize directly
        if not item_id:
            _finalize_single(page_item, result, tenant_id)
            await _emit_complete(job_id, item_id, 'success' if not skipped else 'skipped')
            _update_job_status(job_id)
            return

        # 3. Multi-page: use ATOMIC counter increment to decide who finalizes
        with transaction.atomic():
            # Increment processed_pages on the parent using F() – safe for 50 parallel workers
            updated_rows = InvoiceProcessingItem.objects.filter(
                id=item_id,
                status__in=['pending', 'processing']   # Only count once
            ).update(
                processed_pages=F('processed_pages') + 1,
                updated_at=timezone.now()
            )

            # Re-read with lock
            parent = InvoiceProcessingItem.objects.select_for_update().get(id=item_id)

            # Exactly ONE worker will see processed_pages == page_count
            if parent.processed_pages < parent.page_count:
                logger.info(f"[MERGE] Job {job_id}: {parent.processed_pages}/{parent.page_count} done. Waiting.")
                return

            if parent.status in ('success', 'partial', 'failed'):
                logger.info(f"[MERGE] Job {job_id} parent {item_id} already finalized. Skip.")
                return

            # This worker finalizes the invoice
            children = InvoiceProcessingItem.objects.filter(parent_item_id=item_id)
            success_c = children.filter(status='success').count()
            failed_c  = children.filter(status='failed').count()

            merged = _merge_pages(children.order_by('page_number'))
            _validate(merged, job_id)

            if success_c == parent.page_count:
                final_status = 'success'
            elif success_c > 0:
                final_status = 'partial'
            else:
                final_status = 'failed'

            parent.result_json  = merged
            parent.status       = final_status
            parent.save(update_fields=['result_json', 'status', 'updated_at'])

            logger.info(f"[MERGE] Invoice {item_id} finalized: {final_status} ({success_c}/{parent.page_count} pages ok)")

            if final_status in ('success', 'partial'):
                _persist(parent, merged, tenant_id)

        await _emit_complete(job_id, item_id, final_status)
        _update_job_status(job_id)

    except Exception as e:
        logger.error(f"[MERGE] Job {job_id} page {page_number} error: {e}")
        await kafka_client.publish('retry', {
            'stage': 'merge', 'error': str(e),
            'retry_count': payload.get('retry_count', 0) + 1,
            **payload,
        })


def _merge_pages(children) -> dict:
    final = {"invoice": {}, "items": []}
    for child in children:
        data = child.result_json or {}
        inv  = data.get("invoice", {})
        # Fill header from first non-empty value for each key
        for k, v in inv.items():
            if v and not final["invoice"].get(k):
                final["invoice"][k] = v
        items = data.get("items", [])
        if isinstance(items, list):
            final["items"].extend(items)
    return final


def _validate(merged: dict, job_id: int):
    invoice = merged.get("invoice", {})
    items   = merged.get("items", [])
    issues  = []

    if not invoice.get("Vendor Name"):    issues.append("missing_vendor")
    if not invoice.get("Voucher Date"):   issues.append("missing_date")
    if not items:                          issues.append("no_line_items")

    try:
        declared = float(str(invoice.get("Total Invoice Value", "0") or "0").replace(",", ""))
        computed  = sum(float(str(it.get("Item Amount", "0") or "0").replace(",", "")) for it in items)
        if declared and abs(declared - computed) > 1.0:
            issues.append(f"total_mismatch:{declared:.2f}≠{computed:.2f}")
    except Exception:
        pass

    if issues:
        merged["_validation_issues"] = issues
        logger.warning(f"[VALIDATE] Job {job_id}: {issues}")


def _finalize_single(item, result: dict, tenant_id: str):
    item.result_json = result
    item.status = 'success'
    item.save(update_fields=['result_json', 'status', 'updated_at'])
    _persist(item, result, tenant_id)


def _persist(item, result: dict, tenant_id: str):
    try:
        from core.ocr_cache import save_ocr_cache
        from core.processing_engine import run_invoice_processing_pipeline
        if item.file_hash:
            save_ocr_cache(item.file_hash, tenant_id, item.file_path, result, 'PENDING')
            run_invoice_processing_pipeline(item.file_hash, tenant_id)
    except Exception as e:
        logger.warning(f"[PERSIST] Error for item {item.id}: {e}")


async def _emit_complete(job_id, item_id, status: str):
    await kafka_client.publish('complete', {
        'job_id': job_id, 'item_id': item_id, 'status': status,
    }, key=str(job_id))


def _update_job_status(job_id: int):
    from vouchers.models import BulkInvoiceJob
    from django.db import transaction
    try:
        with transaction.atomic():
            job     = BulkInvoiceJob.objects.select_for_update().get(id=job_id)
            masters = job.items.filter(parent_item_id=None)
            done    = masters.filter(status__in=['success', 'partial', 'failed']).count()
            total   = masters.count() or job.total_files
            if done >= total > 0:
                job.status          = 'completed'
                job.processed_count = masters.filter(status__in=['success', 'partial']).count()
                job.failed_count    = masters.filter(status='failed').count()
                job.save()
                logger.info(f"[JOB] {job_id} COMPLETED")
    except Exception as e:
        logger.error(f"[JOB STATUS] {job_id}: {e}")


async def run():
    logger.info("[MERGE SERVICE] invoice.ai consumer starting")
    await kafka_client.consume('ai', 'merge-workers', handle_ai_event)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
