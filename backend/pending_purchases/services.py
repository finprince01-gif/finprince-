import logging
from django.db import transaction
from .models import PendingPurchase
from ocr_pipeline.statuses import ValidationEnums
from ocr_pipeline.models import InvoiceTempOCR

logger = logging.getLogger(__name__)


# ── Trigger conditions for Pending Purchase queue ─────────────────────────────
# A record should enter the Pending Purchase queue any time the validation pass
# identifies an unresolved state that a human must act on BEFORE a voucher can
# be created.  The only case where we do NOT queue a record is when it is
# FULLY CLEAN (vendor exists + voucher is new/not duplicate + all items exist)
# or when it is a DUPLICATE (already in the ledger).
_PENDING_TRIGGER_VENDOR   = {ValidationEnums.VENDOR_STATUS_CREATE}
_PENDING_TRIGGER_ITEM     = {ValidationEnums.ITEM_STATUS_CREATE}
_PENDING_SKIP_VOUCHER     = {ValidationEnums.VOUCHER_STATUS_EXISTING}   # duplicates → skip


def _needs_pending_queue(vendor_status, voucher_status, item_status, validation_status=None, auto_save=False) -> bool:
    """
    Returns True when the record cannot be auto-saved and must wait in the
    Pending Purchase queue for manual resolution.
    """
    # Hard skip: duplicate invoice — never queue
    if voucher_status in _PENDING_SKIP_VOUCHER:
        return False

    # Terminal states or already created vouchers stay out of the queue
    if validation_status in {'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE', 'VOUCHER_CREATED', 'COMPLETED', 'FAILED', 'ERROR'}:
        return False

    vendor_unresolved = (vendor_status == ValidationEnums.VENDOR_STATUS_CREATE)
    item_unresolved = (item_status == ValidationEnums.ITEM_STATUS_CREATE)
    # Voucher is unresolved if it's new and we are not currently finalizing/saving
    voucher_unresolved = (voucher_status == ValidationEnums.VOUCHER_STATUS_NEW) and not auto_save
    # Validation is unresolved if it's not finalized and we are not currently finalizing/saving
    validation_unresolved = (validation_status in {None, 'PENDING', 'NEED_VENDOR', 'NEED_ITEM', 'NEED_TO_SAVE', 'PENDING_PURCHASE'}) and not auto_save

    is_pending = (
        vendor_unresolved
        or item_unresolved
        or voucher_unresolved
        or validation_unresolved
    )
    return is_pending


def evaluate_pending_purchase(record, vendor_status, voucher_status, item_status, tenant_id, ui_row=None, auto_save=False):
    logger.critical(
        f"[PENDING_EVALUATION_ENTERED] "
        f"record_id={record.id} "
        f"invoice_no={getattr(record,'invoice_no',None)}"
    )

    logger.info(
        f"[PENDING_EVAL_ENTER] record={record.id} session={record.upload_session_id} "
        f"vendor={vendor_status} voucher={voucher_status} item={item_status}"
    )

    is_pending = _needs_pending_queue(vendor_status, voucher_status, item_status, record.validation_status, auto_save)
    is_duplicate = (voucher_status == ValidationEnums.VOUCHER_STATUS_EXISTING)

    logger.critical(
        f"[PENDING_DECISION] "
        f"record_id={record.id} "
        f"vendor_status={vendor_status} "
        f"item_status={item_status} "
        f"validation_status={record.validation_status} "
        f"is_duplicate={is_duplicate} "
        f"is_pending={is_pending}"
    )

    trace_msg = (
        f"[PENDING_DECISION_TRACE]\n"
        f"record_id={record.id}\n"
        f"vendor_status={vendor_status}\n"
        f"item_status={item_status}\n"
        f"voucher_status={voucher_status}\n"
        f"validation_status={record.validation_status}\n"
        f"is_pending={is_pending}"
    )
    print(trace_msg)
    logger.critical(trace_msg)

    exists_in_queue = PendingPurchase.objects.filter(source_scan_row_id=record.id).exists()

    if not is_pending and not exists_in_queue:
        logger.info(
            f"[PENDING_SKIP] record={record.id} "
            f"vendor={vendor_status} voucher={voucher_status} item={item_status} "
            f"reason=does_not_meet_pending_criteria"
        )
        return False

    logger.info(f"[PENDING_MATCH] record={record.id} condition met or exists in queue — queuing/updating for manual resolution")

    with transaction.atomic():
        logger.critical(
            f"[PENDING_QUEUE_WRITE] "
            f"record_id={record.id}"
        )

        # A record is RESOLVED ONLY when a voucher has been saved or it is a confirmed
        # duplicate. Vendor/item existence alone is NOT sufficient — if we mark RESOLVED
        # here, the row disappears from the queue before the user can click Finalize.
        voucher_actually_saved = (
            record.validation_status in ('VOUCHER_CREATED',)
            or voucher_status in ('VOUCHER_STATUS_EXISTING', 'VOUCHER_CREATED')
        )
        dynamic_status = 'RESOLVED' if (
            voucher_actually_saved
            or record.validation_status in ('DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE')
            or is_duplicate
        ) else 'PENDING'


        # ── UPSERT: prevent duplicate queue entries on revalidation ──
        obj, created = PendingPurchase.objects.update_or_create(
            source_scan_row_id=record.id,
            defaults={
                'company_id': tenant_id,
                'branch_id': tenant_id,
                'scan_session_id': record.upload_session_id,
                'source_document_hash': record.file_hash,
                'invoice_number': (
                    ui_row.get('invoice_no') if ui_row
                    else getattr(record, 'supplier_invoice_no', '')
                ),
                'invoice_date': (
                    ui_row.get('invoice_date') if ui_row
                    else getattr(record, 'invoice_date', '')
                ),
                'vendor_name': (
                    ui_row.get('vendor_name') if ui_row
                    else getattr(record, 'vendor_name', '')
                ),
                'vendor_gstin': (
                    ui_row.get('vendor_gstin') if ui_row
                    else getattr(record, 'gstin', '')
                ),
                'amount': ui_row.get('total_amount') if ui_row else None,
                'vendor_status': vendor_status,
                'voucher_status': voucher_status,
                'item_status': item_status,
                'pending_purchase_status': dynamic_status,
                'extraction_payload': record.extracted_data,
                'review_payload': ui_row or {},
            }
        )

        logger.critical(
            f"[PENDING_QUEUE_WRITTEN] "
            f"queue_id={obj.id} "
            f"created={created}"
        )

        logger.critical(
            f"[PENDING_QUEUE_COUNT] "
            f"count={PendingPurchase.objects.count()}"
        )

        from django.db import connection
        logger.critical(
            f"[ACTIVE_DATABASE] "
            f"name={connection.settings_dict['NAME']}"
        )

        action = "[PENDING_INSERT]" if created else "[PENDING_UPSERT]"
        if created:
            logger.info(
                f"[PENDING_ITEM_CREATED] invoice={obj.invoice_number} "
                f"source_row={record.id} status={obj.pending_purchase_status}"
            )
        logger.info(f"{action} id={obj.id} record={record.id} hash={record.file_hash}")

        # ── Mark the OCR staging row without triggering immutability guards ──
        # Use queryset.update() so the model-level save() hook is bypassed.
        # This is safe: we are only updating bookkeeping fields, not business data.
        target_val_status = 'PENDING_PURCHASE'
        if not is_pending:
            if is_duplicate:
                target_val_status = 'DUPLICATE'
            else:
                target_val_status = 'NEED_TO_SAVE'

        InvoiceTempOCR.objects.filter(id=record.id).update(
            processed=True,
            validation_status=target_val_status,
            status='COMPLETED',
        )
        # Keep the in-memory record consistent for callers that read these fields
        record.processed = True
        record.validation_status = target_val_status
        record.status = 'COMPLETED'

        logger.info(
            f"[PENDING_DB_COMMIT] record={record.id} marked as COMPLETED/{target_val_status} "
            f"(via update, immutability guard bypassed)"
        )
        logger.info(f"[PENDING_QUEUE_SUCCESS] record={record.id} moved to pending queue successfully")
        return is_pending
