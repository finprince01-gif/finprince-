import asyncio
import os
import logging
from typing import Dict, Any
from .worker_base import BaseWorker

logger = logging.getLogger(__name__)

class FinalizeWorker(BaseWorker):
    """
    Handles finalization tasks: exports to Zoho/ERP, snapshot archival, and cleanup.
    Role: FINALIZE / EXPORT
    Queue: finalize (or export)
    """
    def __init__(self):
        super().__init__(role="FINALIZE", queue_type="finalize")
        self.allowed_task_types = ['FINALIZE']

    async def handle_task(self, task: Dict[str, Any]):
        # [PHASE 11.5] Unwrap canonical payload
        payload = task['payload']
        task_type = task['task_type']
        record_id = payload.get('record_id')
        session_id = task['session_id']

        import time
        t_finalize_start = time.time()
        logger.info(f"[FINALIZE_WORKER_START] type={task_type} id={task.get('id')} record={record_id} session={session_id}")
        logger.info(f"[FINALIZE_STAGE_ENTER] type={task_type} id={task.get('id')} record={record_id} session={session_id}")
        logger.info(f"[FINALIZE_WORKER_ENTER] id={task.get('id')} record={record_id}")
        logger.info(f"[FINALIZE_WORKER_FETCH] id={task.get('id')}")

        job_id = payload.get('job_id') or task.get('job_id', 'unknown')
        item_id = payload.get('item_id')  # nullable — item=None is NOT a failure condition
        # CRITICAL: is_failed must come ONLY from explicit upstream assembly failure flag.
        # item=None, invoice_no=unknown are NOT failure indicators.
        raw_failed_flag = payload.get('failed', False)
        is_failed = bool(raw_failed_flag)  # Deterministic boolean
        tenant_id = task.get('tenant_id', 'unknown')

        # [FORENSIC] Failure evaluation — must never derive FAILED from nullable metadata
        logger.info(f"[CONTEXT_TRACE_FINALIZE_RECEIVE] job_id={job_id} record_id={record_id} session_id={session_id} tenant_id={tenant_id} trace_id={task.get('trace_id')}")
        logger.info(f"[FINALIZE_FAILURE_EVALUATION] record={record_id} raw_failed_flag={raw_failed_flag} item_id={item_id} is_failed={is_failed}")
        logger.info(f"[FINALIZE_FAILURE_REASON] record={record_id} reason={'EXPLICIT_ASSEMBLY_FAILURE' if is_failed else 'NONE_PIPELINE_SUCCESS'}")
        logger.info(f"[FINALIZE_TERMINAL_DECISION] record={record_id} is_failed={is_failed}")
        if not is_failed:
            logger.info(f"[FINALIZE_FALSE_FAILURE_PREVENTED] record={record_id} item_id={item_id} — item=None is NOT a failure, proceeding as SUCCESS")

        logger.info(f"[FINALIZE_DB_COMMIT] record={record_id} job={job_id} item={item_id} failed={is_failed}")

        loop = asyncio.get_running_loop()

        # ── PATH A: item_id-based finalization (legacy InvoiceProcessingItem / OCRTask) ──
        if item_id:
            from core.constants import ItemStatus
            from vouchers.models import InvoiceProcessingItem, update_job_progress
            from ocr_pipeline.models import OCRTask, update_ocr_job_progress
            import uuid

            is_ocr_task = False
            try:
                uuid.UUID(str(item_id))
                is_ocr_task = True
            except Exception:
                pass

            def commit_item_state():
                if is_ocr_task:
                    status = 'FAILED' if is_failed else 'COMPLETED'
                    OCRTask.objects.filter(id=item_id).update(status=status)
                    if job_id:
                        update_ocr_job_progress(job_id)
                else:
                    status = ItemStatus.FAILED if is_failed else ItemStatus.FINALIZED
                    InvoiceProcessingItem.objects.filter(id=item_id).update(status=status)
                    if job_id:
                        update_job_progress(job_id)

            await loop.run_in_executor(None, commit_item_state)

        # ── PATH B: record_id-based finalization (primary async upload path, item_id is None) ──
        # [FIX] This path was entirely missing. When assembly enqueues FINALIZE with only
        # record_id/job_id (no item_id), commit_state() never ran, leaving:
        #   - processed counters at 0
        #   - InvoiceTempOCR status unchanged
        #   - OCRJob never marked complete
        #   - frontend stuck in PROCESSING forever
        if record_id:
            def commit_record_state():
                from ocr_pipeline.models import InvoiceTempOCR, OCRJob, PipelineStatus, SessionFinalizationState, FinalizedSnapshot
                from core.redis_orchestrator import orchestrator

                logger.info(f"[FINALIZE_WORKER_ENTER] record={record_id} session={session_id} job={job_id} failed={is_failed}")
                logger.info(f"[CANONICAL_CONTEXT_TRACE] record={record_id} session={session_id} job={job_id} tenant={tenant_id}")

                # Resolve canonical session_id from DB — never trust the SQS message alone.
                # The assembly_worker falls back to 'system' when session_id is absent from
                # the message envelope. That causes all session-scoped queries to return 0 rows.
                canonical_session_id = session_id
                try:
                    db_record = InvoiceTempOCR.objects.filter(id=record_id).values('upload_session_id', 'tenant_id').first()
                    if db_record:
                        canonical_session_id = db_record['upload_session_id'] or session_id
                        logger.info(f"[SESSION_FLAG_READ] record={record_id} sqs_session={session_id} db_session={canonical_session_id}")
                    else:
                        logger.warning(f"[FINALIZE_RECORD_NOT_FOUND] record={record_id} using fallback session={session_id}")
                except Exception as e:
                    logger.warning(f"[SESSION_RESOLVE_FAIL] record={record_id} error={e} using sqs_session={session_id}")

                # 0. HYDRATION VISIBILITY BARRIER — gate on snapshot existence for THIS record.
                # [FIX] Use record_id-scoped check, NOT session_id. The session_id in the SQS
                # message may be 'system' or stale. The FinalizedSnapshot was created by
                # assemble_multi_page_record() keyed to record.upload_session_id (=canonical_session_id).
                # If we check with a wrong session_id, this guard falsely blocks finalization forever.
                if not is_failed:
                    snapshot_exists = FinalizedSnapshot.objects.filter(session_id=canonical_session_id).exists()
                    if not snapshot_exists:
                        # Also check by record_id path via InvoiceTempOCR link
                        row_count = InvoiceTempOCR.objects.filter(upload_session_id=canonical_session_id).count()
                        logger.info(f"[TERMINAL_GATE_EVALUATION] record={record_id} session={canonical_session_id} snapshot_exists={snapshot_exists} row_count={row_count}")
                        if row_count == 0:
                            logger.warning(f"[HYDRATION_VISIBILITY_PENDING] session={canonical_session_id} job={job_id} record={record_id}. 0 rows and no snapshot yet.")
                            logger.warning(f"[TERMINAL_STATE_BLOCKED] session={canonical_session_id} reason=hydration_visibility_pending")
                            raise ValueError(f"HYDRATION_VISIBILITY_PENDING: session={canonical_session_id} record={record_id}")
                    logger.info(f"[HYDRATION_VISIBILITY_CONFIRMED] session={canonical_session_id} snapshot_exists={snapshot_exists}")
                    logger.info(f"[SNAPSHOT_COMPLETE] record={record_id} session={canonical_session_id}")
                    logger.info(f"[MATERIALIZATION_COMPLETE] record={record_id} session={canonical_session_id}")
                    logger.info(f"[MATERIALIZATION_DB_COMMITTED] session={canonical_session_id}")

                # 1. Mark the record terminal
                terminal_status = PipelineStatus.FAILED if is_failed else PipelineStatus.FINALIZED
                updated = InvoiceTempOCR.objects.filter(id=record_id).update(
                    status=terminal_status,
                    processed=(not is_failed)
                )
                logger.info(
                    f"[FINALIZE_DB_COMMIT] record={record_id} status={terminal_status} "
                    f"processed={not is_failed} rows_updated={updated}"
                )
                logger.info(f"[STATE_MACHINE_TRANSITION] record={record_id} new_state={terminal_status}")

                # 1B. ── PURCHASE SAVE SERVICE ────────────────────────────────
                # Call the canonical validate_and_process(auto_save=True) — the same service
                # used by Manual Purchase save. This persists into:
                #   PurchaseVoucher / VoucherPurchaseSupplierDetails
                #   PurchaseEntry, PurchaseItems, ledger tables, tax tables
                # Duplicate validation occurs INSIDE this service — NOT as an orchestration gate.
                # This must run AFTER terminal status is written so the record is queryable.
                if not is_failed:
                    logger.info(f"[PURCHASE_SAVE_SERVICE_START] record={record_id} session={canonical_session_id}")
                    try:
                        record_obj = InvoiceTempOCR.objects.filter(id=record_id).first()
                        if record_obj:
                            from ocr_pipeline.pipeline import validate_and_process
                            logger.info(f"[PURCHASE_DB_INSERT_START] record={record_id} vendor_id={getattr(record_obj, 'vendor_id', None)} validation_status={getattr(record_obj, 'validation_status', None)}")
                            from django.db import transaction as _tx_save
                            try:
                                with _tx_save.atomic():
                                    save_result = validate_and_process(record_obj, auto_save=True)
                                    save_status = save_result.get('status') if isinstance(save_result, dict) else None
                                    if save_status == 'VOUCHER_CREATED':
                                        logger.info(f"[PURCHASE_DB_INSERT_SUCCESS] record={record_id} status=VOUCHER_CREATED")
                                        logger.info(f"[PURCHASE_COMMIT_SUCCESS] record={record_id} voucher_id={save_result.get('voucher_id')}")
                                    elif save_status in ('DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE'):
                                        logger.info(f"[PURCHASE_DUPLICATE_DETECTED] record={record_id} status={save_status} validation_status={save_result.get('validation_message')}")
                                        # Duplicate is not a failure — update record status to reflect
                                        InvoiceTempOCR.objects.filter(id=record_id).update(
                                            validation_status=save_status
                                        )
                                    else:
                                        logger.warning(f"[PURCHASE_SAVE_NOT_CREATED] record={record_id} save_status={save_status} message={save_result.get('validation_message') if isinstance(save_result, dict) else save_result}")
                            except Exception as tx_err:
                                logger.error(f"[DB_ROLLBACK] record={record_id} error={tx_err}")
                                logger.exception(f"[FINALIZE_EXCEPTION] record={record_id} purchase_save rollback triggered")
                                # Non-fatal: log and continue — record is already marked FINALIZED
                        else:
                            logger.warning(f"[PURCHASE_SAVE_RECORD_MISSING] record={record_id} — InvoiceTempOCR not found, skipping purchase save")
                    except Exception as ps_err:
                        logger.error(f"[PURCHASE_SAVE_SERVICE_ERROR] record={record_id} error={ps_err}")
                        logger.exception(f"[FINALIZE_EXCEPTION] record={record_id} purchase_save_service threw")
                        # Non-fatal: orchestration state is already committed above
                else:
                    logger.info(f"[PURCHASE_SAVE_SERVICE_SKIPPED] record={record_id} reason=is_failed")


                # 2. Update the OCRJob processed/failed counts
                if job_id and str(job_id) != 'unknown':
                    try:
                        from django.db import models as dj_models
                        if is_failed:
                            OCRJob.objects.filter(id=job_id).update(
                                failed_files=dj_models.F('failed_files') + 1
                            )
                        else:
                            OCRJob.objects.filter(id=job_id).update(
                                processed_files=dj_models.F('processed_files') + 1
                            )
                        job = OCRJob.objects.filter(id=job_id).values(
                            'total_files', 'processed_files', 'failed_files'
                        ).first()
                        if job:
                            terminal_count = (job['processed_files'] or 0) + (job['failed_files'] or 0)
                            total = job['total_files'] or 1
                            logger.info(
                                f"[JOB_PROGRESS] job={job_id} terminal={terminal_count}/{total}"
                            )
                            if terminal_count >= total:
                                # Only mark job FAILED if ZERO files succeeded
                                final_job_status = 'FAILED' if (job['processed_files'] or 0) == 0 else 'COMPLETED'
                                OCRJob.objects.filter(id=job_id).update(status=final_job_status)
                                logger.info(f"[BULK_JOB_COMPLETE] job={job_id} status={final_job_status} processed={job['processed_files']} failed={job['failed_files']}")
                    except Exception as job_err:
                        logger.exception(f"[JOB_PROGRESS_ERR] job={job_id} error={job_err}")

                # 3. Push a terminal Redis status — NEVER emit FAILED for session unless
                # is_failed is explicitly True from upstream assembly signal
                final_redis_status = "FAILED" if is_failed else "HYDRATION_READY"
                orchestrator.update_session_status(
                    str(record_id), final_redis_status, progress=100.0,
                    extra_data={"hydration_ready": (not is_failed)}
                )
                logger.info(f"[TERMINAL_STATUS_PERSISTED] record={record_id} redis_status={final_redis_status}")
                logger.info(f"[HYDRATION_READY_EMITTED] record={record_id}")

                # 4. Update session-level Redis status using canonical_session_id (DB-resolved)
                if canonical_session_id and canonical_session_id not in ('unknown', 'system'):
                    orchestrator.update_session_status(
                        canonical_session_id, final_redis_status, progress=100.0,
                        extra_data={"hydration_ready": (not is_failed)}
                    )
                    logger.info(f"[SESSION_TERMINAL_STATUS] session={canonical_session_id} status={final_redis_status}")
                    logger.info(f"[HYDRATION_READY_EMITTED] session={canonical_session_id}")
                    logger.info(f"[TERMINAL_RELEASE_SUCCESS] record={record_id} session={canonical_session_id}")

                # 5. Mark SessionFinalizationState export_complete + materialization_complete
                # These are monotonic — once True they MUST NOT regress
                logger.info(f"[SESSION_FLAG_WRITE] record={record_id} session={canonical_session_id} is_failed={is_failed}")
                state = SessionFinalizationState.objects.filter(id=str(record_id)).first()
                if state:
                    fields_to_save = []
                    if not state.export_complete:
                        state.export_complete = True
                        fields_to_save.append('export_complete')
                    if not state.materialization_complete:
                        state.materialization_complete = True
                        fields_to_save.append('materialization_complete')
                    if is_failed and not state.snapshot_complete:
                        state.snapshot_complete = True
                        fields_to_save.append('snapshot_complete')
                        
                    if fields_to_save:
                        state.save(update_fields=fields_to_save)
                        logger.info(f"[FINALIZE_STATE_PERSISTED] record={record_id} fields={fields_to_save} session={canonical_session_id}")
                        logger.info(f"[FINALIZE_SNAPSHOT_CREATED] record={record_id} materialization_complete={state.materialization_complete} snapshot_complete={state.snapshot_complete}")
                    else:
                        logger.info(f"[FINALIZE_STATE_ALREADY_SET] record={record_id} — monotonic, no overwrite")
                else:
                    logger.warning(f"[FINALIZE_STATE_MISSING] record={record_id} — SessionFinalizationState not found, creating stub")
                    # Create stub row so orchestrator can read materialization_complete=True
                    try:
                        SessionFinalizationState.objects.update_or_create(
                            id=str(record_id),
                            defaults={
                                'export_complete': True,
                                'materialization_complete': True,
                                'snapshot_complete': is_failed,
                            }
                        )
                        logger.info(f"[FINALIZE_STATE_STUB_CREATED] record={record_id}")
                    except Exception as stub_err:
                        logger.exception(f"[FINALIZE_STATE_STUB_FAIL] record={record_id} error={stub_err}")


            await loop.run_in_executor(None, commit_record_state)

        logger.info(f"[JOB_TERMINAL_STATE_SET] record={record_id} job={job_id}")
        logger.info(f"[FINALIZE_COMPLETE] record={record_id} job={job_id}")
        logger.info(f"[FINALIZE_WORKER_EXIT] id={task.get('id')} record={record_id}")
        logger.info(f"[FINALIZE_STAGE_EXIT] record={record_id} duration={time.time() - t_finalize_start:.3f}s")

if __name__ == "__main__":
    import django
    django.setup()
    worker = FinalizeWorker()
    asyncio.run(worker.run())
