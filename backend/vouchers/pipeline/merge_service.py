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
# Force UTF-8 output on Windows so emoji prints don't crash the process
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
import asyncio
import logging
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from . import kafka_client

logger = logging.getLogger(__name__)


async def handle_ai_event(payload: dict):
    print("🔥 MERGE RECEIVED:", payload, flush=True)
    job_id      = payload['job_id']
    item_id     = payload.get('item_id')
    page_number = payload.get('page_number', 1)
    page_count  = payload.get('page_count', 1)
    result      = payload.get('result') or {}
    skipped     = payload.get('skipped', False)
    page_key    = payload.get('page_key', '')
    page_hash   = payload.get('page_hash')
    tenant_id   = payload.get('tenant_id', '')

    print(f"🚀 MERGE START: {job_id} | Page {page_number}/{page_count}", flush=True)
    logger.info(f"[MERGE] Job {job_id} page {page_number}/{page_count}")

    try:
        from asgiref.sync import sync_to_async
        await sync_to_async(_process_merge, thread_sensitive=False)(
            job_id, item_id, page_number, page_count, result, skipped, page_key, page_hash, tenant_id
        )

    except Exception as e:
        print("❌ ERROR OCCURRED:", str(e))
        logger.error(f"[MERGE] Job {job_id} page {page_number} error: {e}")
        await kafka_client.publish('retry', {
            'stage': 'merge', 'error': str(e),
            'retry_count': payload.get('retry_count', 0) + 1,
            **payload,
        })
    finally:
        print("🔥 STEP 7: PROCESSING COMPLETE")

def _process_merge(job_id, item_id, page_number, page_count, result, skipped, page_key, page_hash, tenant_id):
    from vouchers.models import InvoiceProcessingItem, BulkInvoiceJob
    from django.db import transaction
    from django.db.models import F
    from django.utils import timezone
    import asyncio
    import json

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
        kafka_client.publish_sync('complete', {
            'job_id': job_id,
            'item_id': item_id,
            'status': 'success' if not skipped else 'skipped'
        })
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
        print(f"🔥 STEP 6: FINALIZED OCR DATA | Job: {job_id} | Status: {final_status}")
        print(f"📊 HEADERS: {json.dumps(merged.get('invoice', {}), indent=2)}")
        print(f"📦 ITEMS COUNT: {len(merged.get('items', []))}")
        if merged.get('items'):
            print(f"📦 FIRST ITEM: {json.dumps(merged['items'][0], indent=2)}")
        
        parent.save(update_fields=['result_json', 'status', 'updated_at'])
        print("🔥 STEP 6.1: DB UPDATED", parent.status)

        logger.info(f"[MERGE] Invoice {item_id} finalized: {final_status} ({success_c}/{parent.page_count} pages ok)")

        if final_status in ('success', 'partial'):
            _persist(parent, merged, tenant_id)
            print(f"💾 DB UPDATED: {job_id}", flush=True)

    kafka_client.publish_sync('complete', {
        'job_id': job_id,
        'item_id': item_id,
        'status': final_status
    })
    _update_job_status(job_id)


def _merge_pages(children) -> dict:
    final = {"invoice": {}, "items": []}
    for child in children:
        data = child.result_json or {}

        # ── Handle NESTED schema: {invoice: {...}, items: [...]} ──────────────
        # This comes from parse_and_process_ocr / AI extraction
        inv = data.get("invoice", {})
        if inv and isinstance(inv, dict):
            for k, v in inv.items():
                if v and not final["invoice"].get(k):
                    final["invoice"][k] = v

        # ── Handle FLAT schema from HybridExtractor ───────────────────────────
        # Keys: invoice_number, vendor, date, gstin, totals, items
        elif not inv:
            flat_map = {
                "Supplier Invoice No": data.get("invoice_number", ""),
                "Vendor Name":         data.get("vendor", ""),
                "Voucher Date":        data.get("date", ""),
                "GSTIN":               data.get("gstin", ""),
                "Total Invoice Value": (data.get("totals") or {}).get("total", ""),
                "Total Taxable Value": (data.get("totals") or {}).get("subtotal", ""),
                "Total IGST":          (data.get("totals") or {}).get("igst", ""),
                "Total CGST":          (data.get("totals") or {}).get("cgst", ""),
                "Total SGST":          (data.get("totals") or {}).get("sgst", ""),
            }
            for k, v in flat_map.items():
                if v and not final["invoice"].get(k):
                    final["invoice"][k] = str(v)

        # ── Items (present in both schemas) ───────────────────────────────────
        items = data.get("items", [])
        if isinstance(items, list):
            final["items"].extend(items)

    print(f"[MERGE] merged invoice keys: {list(final['invoice'].keys())}", flush=True)
    print(f"[MERGE] merged items count: {len(final['items'])}", flush=True)
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
    print(f"[PERSIST] START: Item {item.id} | Hash {item.file_hash} | Tenant {tenant_id}")
    print(f"[PERSIST] Result keys: {list(result.keys())}")
    print(f"[PERSIST] Invoice fields: {list(result.get('invoice', {}).keys())}")
    print(f"[PERSIST] Items count: {len(result.get('items', []))}")
    try:
        from core.ocr_cache import update_staged_invoice_extracted_data, get_cached_ocr
        from core.processing_engine import run_invoice_processing_pipeline

        if not item.file_hash:
            print(f"[PERSIST] ERROR: item {item.id} has no file_hash — cannot update staging row")
            return

        # ── UPDATE the existing row (created at upload time) with the OCR result ──
        # Do NOT use save_ocr_cache() here — that does INSERT and fails on duplicate key,
        # leaving extracted_data={} and status=PENDING forever.
        print(f"[PERSIST] Updating staging row for hash={item.file_hash[:12]}...")
        updated = update_staged_invoice_extracted_data(
            file_hash=item.file_hash,
            tenant_id=tenant_id,
            extracted_data=result,
            validation_status='PENDING',
        )
        # ── FALLBACK: if tenant_id mismatch, try updating by hash only ────────
        if not updated:
            print(f"[PERSIST] ⚠️ tenant mismatch — retrying hash-only update for hash={item.file_hash[:12]}", flush=True)
            from django.db import connection
            import json as _json
            extracted_json = _json.dumps(result, ensure_ascii=False, default=str)
            try:
                with connection.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE invoice_ocr_temp
                        SET    extracted_data = %s, validation_status = 'PENDING', status = 'PENDING'
                        WHERE  file_hash = %s
                          AND  expires_at > NOW()
                          AND  processed  = FALSE
                        """,
                        [extracted_json, item.file_hash]
                    )
                    # Also read back the actual tenant_id for subsequent pipeline call
                    cur.execute("SELECT tenant_id FROM invoice_ocr_temp WHERE file_hash = %s LIMIT 1", [item.file_hash])
                    row = cur.fetchone()
                    if row:
                        tenant_id = row[0]   # Use the real tenant_id from DB
                    updated = cur.rowcount > 0
                print(f"[PERSIST] Fallback update result: {updated}, real tenant={tenant_id}", flush=True)
            except Exception as fe:
                print(f"[PERSIST] Fallback update failed: {fe}", flush=True)
        if updated:
            print(f"[PERSIST] ✅ DB updated with extracted_data for hash={item.file_hash[:12]}")
        else:
            print(f"[PERSIST] ⚠️ No staging row matched hash={item.file_hash[:12]} — row may be expired or already processed")

        # ── Run the engine (Mapping → Vendor Validation → DB Update) ──
        print(f"[PERSIST] Running invoice processing pipeline...")
        res = run_invoice_processing_pipeline(file_hash=item.file_hash, tenant_id=tenant_id)
        print(f"[PERSIST] Pipeline result: {res}")

        # ── Final status guarantee: if still PENDING after pipeline, mark for attention ──
        record = get_cached_ocr(item.file_hash, tenant_id)
        final_status = record.get('validation_status') if record else None
        print(f"[PERSIST] Post-pipeline validation_status: {final_status}")
        if record and final_status == 'PENDING':
            print(f"[PERSIST] ⚠️ Still PENDING after pipeline — forcing NEEDS_ATTENTION")
            from core.ocr_cache import update_ocr_cache_validation_status
            update_ocr_cache_validation_status(item.file_hash, tenant_id, 'NEEDS_ATTENTION')

    except Exception as e:
        import traceback
        print(f"[PERSIST] ❌ FAILED for item {item.id}: {e}")
        print(traceback.format_exc())
        logger.warning(f"[PERSIST] Error for item {item.id}: {e}")
        # Ensure it doesn't stay PENDING on crash
        try:
            from core.ocr_cache import update_ocr_cache_validation_status
            update_ocr_cache_validation_status(item.file_hash, tenant_id, 'NEEDS_ATTENTION')
        except:
            pass


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
    print("[MERGE] Merge Service Initializing...")
    while True:
        try:
            print("[MERGE] Connecting to Local Kafka...")
            await kafka_client.consume('ai', 'merge-workers-v6', handle_ai_event)
        except Exception as e:
            print(f"❌ [MERGE] CONSUMER DIED: {e}. Restarting in 5s...")
            await asyncio.sleep(5)



if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
