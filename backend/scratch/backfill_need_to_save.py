"""
backfill_need_to_save.py
------------------------
Targeted backfill: Insert NEED_TO_SAVE orphan staging rows directly into
the pending_purchase_queue without re-running validate_and_process.

This script is safe to run multiple times — it uses update_or_create.
"""
import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

import logging
from django.db import transaction
from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
logger = logging.getLogger('backfill_need_to_save')

# ── 1. Identify orphan staging rows ──────────────────────────────────────────
UNRESOLVED_STATUSES = ['NEED_TO_SAVE', 'NEED_VENDOR', 'NEED_ITEM', 'PENDING', 'PENDING_PURCHASE']

staging_unresolved_ids = set(
    InvoiceTempOCR.objects.filter(
        validation_status__in=UNRESOLVED_STATUSES
    ).values_list('id', flat=True)
)

queue_source_ids = set(
    PendingPurchase.objects.values_list('source_scan_row_id', flat=True)
)

orphan_ids = staging_unresolved_ids - queue_source_ids
logger.info(f"Identified {len(orphan_ids)} orphan staging rows to backfill into queue.")

if not orphan_ids:
    logger.info("✅ No orphans found — queue is in sync.")
    sys.exit(0)

# ── 2. Load orphan records ────────────────────────────────────────────────────
orphan_records = InvoiceTempOCR.objects.filter(id__in=orphan_ids)

created_count = 0
skipped_count = 0
error_count = 0

for r in orphan_records:
    try:
        # Determine vendor / item / voucher status based on validation_status
        if r.validation_status in ('NEED_VENDOR',):
            vendor_st = 'VENDOR_STATUS_CREATE'
            voucher_st = 'VOUCHER_STATUS_NEW'
            item_st = 'ITEM_STATUS_EXISTING'   # conservative default
        elif r.validation_status == 'NEED_TO_SAVE':
            vendor_st = 'VENDOR_STATUS_EXISTING'
            voucher_st = 'VOUCHER_STATUS_NEW'
            item_st = 'ITEM_STATUS_EXISTING'
        elif r.validation_status in ('PENDING', 'PENDING_PURCHASE'):
            vendor_st = 'VENDOR_STATUS_CREATE'
            voucher_st = 'VOUCHER_STATUS_NEW'
            item_st = 'ITEM_STATUS_EXISTING'
        else:
            vendor_st = 'VENDOR_STATUS_CREATE'
            voucher_st = 'VOUCHER_STATUS_NEW'
            item_st = 'ITEM_STATUS_CREATE'

        with transaction.atomic():
            obj, created = PendingPurchase.objects.update_or_create(
                source_scan_row_id=r.id,
                defaults={
                    'company_id': r.tenant_id,
                    'branch_id': r.tenant_id,
                    'scan_session_id': r.upload_session_id,
                    'source_document_hash': r.file_hash or '',
                    'invoice_number': r.supplier_invoice_no or '',
                    'invoice_date': getattr(r, 'invoice_date', '') or '',
                    'vendor_name': getattr(r, 'vendor_name', '') or '',
                    'vendor_gstin': getattr(r, 'gstin', '') or '',
                    'amount': None,
                    'vendor_status': vendor_st,
                    'voucher_status': voucher_st,
                    'item_status': item_st,
                    'pending_purchase_status': 'PENDING',
                    'extraction_payload': r.extracted_data or {},
                    'review_payload': {},
                }
            )

            # Mark staging row as processed to avoid future re-processing
            InvoiceTempOCR.objects.filter(id=r.id).update(
                processed=True,
                validation_status='PENDING_PURCHASE',
                status='COMPLETED',
            )

        if created:
            created_count += 1
            logger.info(f"[INSERT] Queue ID={obj.id} staging_id={r.id} inv={r.supplier_invoice_no}")
        else:
            skipped_count += 1
            logger.info(f"[UPSERT] Queue ID={obj.id} staging_id={r.id} (already existed, updated)")

    except Exception as ex:
        error_count += 1
        logger.error(f"[ERROR] staging_id={r.id} inv={r.supplier_invoice_no}: {ex}")

logger.info("")
logger.info(f"=== BACKFILL COMPLETE ===")
logger.info(f"  Inserted (new) : {created_count}")
logger.info(f"  Upserted (upd) : {skipped_count}")
logger.info(f"  Errors         : {error_count}")
logger.info(f"  Total queue now: {PendingPurchase.objects.count()}")
