import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

import logging
from django.db import transaction
from ocr_pipeline.models import InvoiceTempOCR, PipelineStatus
from ocr_pipeline.views import get_save_eligible_rows, get_pending_purchase_eligible_rows
from ocr_pipeline.pipeline import validate_and_process

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("remediate_orphaned_records")

def run_remediation():
    logger.info("Starting remediation backfill for orphaned unresolved records...")
    
    # 1. Fetch all unprocessed records
    unprocessed = InvoiceTempOCR.objects.filter(processed=False)
    logger.info(f"Found {unprocessed.count()} unprocessed records in the database.")
    
    # Group by (upload_session_id, tenant_id)
    session_tenant_pairs = set()
    for r in unprocessed:
        if r.upload_session_id:
            session_tenant_pairs.add((r.upload_session_id, r.tenant_id))
            
    logger.info(f"Grouped into {len(session_tenant_pairs)} unique session-tenant pairs.")
    
    for session_id, tenant_id in session_tenant_pairs:
        logger.info(f"Processing session={session_id} tenant={tenant_id}")
        
        # Get eligibility lists for this session
        eligible_save = get_save_eligible_rows(session_id, tenant_id)
        eligible_pending = get_pending_purchase_eligible_rows(session_id, tenant_id=tenant_id)
        
        eligible_save_ids = [str(t[0].id) for t in eligible_save]
        eligible_pending_ids = [str(t[0].id) for t in eligible_pending]
        
        # Get all unprocessed records in this specific session
        session_records = InvoiceTempOCR.objects.filter(
            upload_session_id=session_id,
            processed=False
        )
        if tenant_id:
            session_records = session_records.filter(tenant_id=tenant_id)
            
        for r in session_records:
            is_save_eligible = str(r.id) in eligible_save_ids
            is_pending_eligible = str(r.id) in eligible_pending_ids
            
            logger.info(f"  Record ID={r.id} inv_no={r.supplier_invoice_no} save_eligible={is_save_eligible} pending_eligible={is_pending_eligible}")
            
            if is_save_eligible or is_pending_eligible:
                logger.info(f"    -> Running validate_and_process(auto_save=True) for record {r.id}")
                try:
                    with transaction.atomic():
                        res = validate_and_process(r, auto_save=True)
                        status = res.get('status') if isinstance(res, dict) else None
                        logger.info(f"    -> Result status={status} for record {r.id}")
                        
                        # Sync status field back to FINALIZED/COMPLETED/etc. in DB
                        if status == 'VOUCHER_CREATED':
                            InvoiceTempOCR.objects.filter(id=r.id).update(
                                status=PipelineStatus.FINALIZED,
                                validation_status='VOUCHER_CREATED',
                                processed=True
                            )
                        elif status in ('DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE'):
                            InvoiceTempOCR.objects.filter(id=r.id).update(
                                status=PipelineStatus.FINALIZED,
                                validation_status=status,
                                processed=True
                            )
                        elif status == 'PENDING_PURCHASE':
                            InvoiceTempOCR.objects.filter(id=r.id).update(
                                status=PipelineStatus.FINALIZED,
                                validation_status='PENDING_PURCHASE',
                                processed=True
                            )
                except Exception as ex:
                    logger.error(f"    -> Error processing record {r.id}: {ex}")
            else:
                logger.info(f"    -> Skipping record {r.id} (not eligible)")

if __name__ == "__main__":
    run_remediation()
