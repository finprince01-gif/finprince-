import logging
from django.db import transaction
from .models import PendingPurchase
from ocr_pipeline.statuses import ValidationEnums

logger = logging.getLogger(__name__)

def evaluate_pending_purchase(record, vendor_status, voucher_status, item_status, tenant_id, ui_row=None):
    """
    Evaluates if a record should be moved to Pending Purchase queue.
    Pending Purchase must ONLY trigger when:
    Vendor = Existing (VENDOR_STATUS_EXISTING)
    Voucher = Existing (VOUCHER_STATUS_EXISTING)
    Item = Create Item (ITEM_STATUS_CREATE)
    """
    logger.info(f"[PENDING_EVAL_ENTER] record={record.id} session={record.upload_session_id}")
    logger.info(f"[PENDING_STATUS_TRACE] record={record.id} vendor={vendor_status} voucher={voucher_status} item={item_status}")
    
    if voucher_status == ValidationEnums.VOUCHER_STATUS_EXISTING:
        logger.info(f"[PENDING_SKIP] record={record.id} is a duplicate voucher (VOUCHER_STATUS_EXISTING)")
        return False

    if (vendor_status == ValidationEnums.VENDOR_STATUS_EXISTING and
        voucher_status == ValidationEnums.VOUCHER_STATUS_EXISTING and
        item_status == ValidationEnums.ITEM_STATUS_EXISTING):
        is_fully_resolved = True
    else:
        is_fully_resolved = False

    if not is_fully_resolved:
        
        logger.info(f"[PENDING_MATCH] record={record.id} condition met.")
        
        with transaction.atomic():
            # Prevent Duplicate Pending Entries via UPSERT
            pp, created = PendingPurchase.objects.update_or_create(
                source_scan_row_id=record.id,
                defaults={
                    'company_id': tenant_id,
                    'branch_id': tenant_id,
                    'scan_session_id': record.upload_session_id,
                    'source_document_hash': record.file_hash,
                    'invoice_number': ui_row.get('invoice_no') if ui_row else getattr(record, 'supplier_invoice_no', ''),
                    'invoice_date': ui_row.get('invoice_date') if ui_row else getattr(record, 'invoice_date', ''),
                    'vendor_name': ui_row.get('vendor_name') if ui_row else getattr(record, 'vendor_name', ''),
                    'vendor_gstin': ui_row.get('vendor_gstin') if ui_row else getattr(record, 'gstin', ''),
                    'amount': ui_row.get('total_amount') if ui_row else None,
                    'vendor_status': vendor_status,
                    'voucher_status': voucher_status,
                    'item_status': item_status,
                    'pending_purchase_status': 'PENDING',
                    'extraction_payload': record.extracted_data,
                    'review_payload': ui_row or {}
                }
            )
            
            if created:
                action = "[PENDING_INSERT]"
                logger.info(f"[PENDING_ITEM_CREATED] invoice={pp.invoice_number} source_row={record.id} status={pp.pending_purchase_status}")
            else:
                action = "[PENDING_UPSERT]"
                
            logger.info(f"{action} id={pp.id} record={record.id} hash={record.file_hash}")
            
            # Remove from Purchase Scan
            record.processed = True
            record.validation_status = 'PENDING_PURCHASE'
            record.status = 'COMPLETED'
            record.save(update_fields=['processed', 'validation_status', 'status'])
            
            logger.info(f"[PENDING_DB_COMMIT] record={record.id} marked as COMPLETED/PENDING_PURCHASE")
            logger.info(f"[PENDING_QUEUE_SUCCESS] record={record.id} moved to pending queue successfully")
            return True
            
    else:
        logger.info(f"[PENDING_SKIP] record={record.id} does not meet pending criteria")
        return False
