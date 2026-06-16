import asyncio
import os
import logging
from typing import Dict, Any
from django.db import transaction
from django.db import models
from django.utils import timezone

from .worker_base import BaseWorker
from ocr_pipeline.models import InvoicePageResult, SessionFinalizationState, InvoiceTempOCR, PipelineStatus
from ocr_pipeline.pipeline import assemble_multi_page_record

logger = logging.getLogger(__name__)

class AssemblyWorker(BaseWorker):
    """
    Handles merging of multi-page invoice data in a one-shot, post-barrier architecture.
    Role: ASSEMBLY
    Queue: assembly
    """
    def __init__(self):
        super().__init__(role="ASSEMBLY", queue_type=os.getenv('SQS_ASSEMBLY_QUEUE_TYPE', 'assembly'))
        self.allowed_task_types = ['ASSEMBLY']

    async def handle_task(self, task: Dict[str, Any]):
        # [PHASE 11.5] Unwrap canonical payload
        payload = task['payload']
        record_id = payload.get('record_id')

        # Resolving identifiers from outer task envelope
        session_id = task.get('session_id') or task.get('upload_session_id') or payload.get('session_id') or "system"
        tenant_id = task.get('tenant_id') or payload.get('tenant_id') or "system"
        correlation_id = task.get('correlation_id', 'unknown')
        job_id = payload.get('job_id') or task.get('job_id', 'unknown')
        item_id = payload.get('item_id') or task.get('item_id')

        logger.info(f"[CONTEXT_TRACE_ASSEMBLY_RECEIVE] job_id={job_id} record_id={record_id} session_id={session_id} tenant_id={tenant_id} trace_id={task.get('trace_id')}")
        logger.info(f"[ASSEMBLY_TASK_ENTER] record={record_id} correlation_id={correlation_id} session={session_id} tenant={tenant_id}")

        loop = asyncio.get_running_loop()

        # 1. Fetch barrier state
        barrier, created = await asyncio.shield(loop.run_in_executor(
            None,
            lambda: SessionFinalizationState.objects.get_or_create(id=str(record_id))
        ))
        if barrier.snapshot_created:
            logger.info(f"[ASSEMBLY_IDEMPOTENT_EXIT] record={record_id}")
            logger.info(f"[recursive_assembly_blocked] record={record_id} Assembly already finalized.")
            return

        expected_pages = barrier.expected_pages

        def get_db_barrier_state(rec_id, expected):
            results = list(InvoicePageResult.objects.filter(record_id=rec_id).values('page_number', 'is_failed'))
            completed_c = sum(1 for r in results if not r['is_failed'])
            failed_c = sum(1 for r in results if r['is_failed'])
            tot = len(results)
            ready = tot >= expected if expected > 0 else False
            return {
                "completed": completed_c,
                "failed": failed_c,
                "total": tot,
                "expected": expected,
                "is_ready": ready
            }

        state = await asyncio.shield(loop.run_in_executor(
            None, 
            lambda: get_db_barrier_state(record_id, expected_pages)
        ))

        # Check if barrier is ready
        if not state["is_ready"]:
            logger.warning(f"[assembly_blocked_partial_barrier] record={record_id} expected={expected_pages} completed={state['total']}")
            return

        # 2. Acquire finalize lock
        from core.redis_orchestrator import orchestrator
        lock_acquired = await asyncio.shield(loop.run_in_executor(
            None,
            lambda: orchestrator.acquire_finalize_lock(record_id)
        ))
        
        if not lock_acquired:
            logger.warning(f"[FINALIZE_ALREADY_SENT] record={record_id} — lock already held, skipping duplicate finalize")
            return

        logger.info(f"[FINALIZE_ENQUEUE_ATTEMPT] record={record_id} job={job_id} item={item_id}")
        record = await asyncio.shield(loop.run_in_executor(
            None,
            lambda: InvoiceTempOCR.objects.get(id=record_id)
        ))

        # 3. Run assembly merge
        logger.info(f"[ASSEMBLY_EXECUTOR_START] role=ASSEMBLY action=MERGE record={record_id}")
        result = await asyncio.shield(loop.run_in_executor(
            self.executor,
            lambda: assemble_multi_page_record(record, job_id=job_id, item_id=item_id, force=True)
        ))
        logger.info(f"[ASSEMBLY_EXECUTOR_DONE] role=ASSEMBLY action=MERGE record={record_id}")

        res_status = result.get('status') if isinstance(result, dict) else None
        logger.info(f"[ASSEMBLY_COMPLETE] record={record_id} status={res_status}")

        # Fetch authoritative counts
        def _get_final_counts():
            results = list(InvoicePageResult.objects.filter(record_id=record_id).values('page_number', 'is_failed', 'canonical_payload'))
            
            c = 0
            f = 0
            for r in results:
                p_payload = r['canonical_payload'] if isinstance(r['canonical_payload'], dict) else {}
                is_failed_page = r['is_failed'] or p_payload.get('status') in ('OCR_FAILED', 'EXTRACTION_FAILED', 'NEED_MANUAL_REVIEW') or '_integrity_blocked' in p_payload
                if is_failed_page:
                    f += 1
                else:
                    c += 1
            
            return c, f, 0

        final_c, final_f, final_p = await asyncio.shield(loop.run_in_executor(None, _get_final_counts))

        # Persist barrier state
        def _persist_barrier_state():
            try:
                b_state = SessionFinalizationState.objects.get(id=str(record_id))
                b_state.completed_pages = final_c
                b_state.failed_pages = final_f
                b_state.save(update_fields=['completed_pages', 'failed_pages'])
                logger.info(f"[BARRIER_STATE_WRITE] record={record_id} completed={b_state.completed_pages} failed={b_state.failed_pages}")
                logger.info(f"[BARRIER_STATE_COMMIT] record={record_id}")
            except Exception as e:
                logger.error(f"[BARRIER_STATE_WRITE_ERROR] record={record_id} error={e}")

        await asyncio.shield(loop.run_in_executor(None, _persist_barrier_state))

        # 4. Determine final status
        SUCCESS_STATUSES = {'FINALIZED', 'SUCCESS', 'SUCCESS_EMPTY_EXPORT'}

        # [PHASE 6 + PHASE 7] Write assembly_complete + continuation_merge_complete flags.
        # These are the authoritative canonical gates for downstream finalization and hydration.
        # continuation_merge_complete is set True here because forensic_merger.merge_group()
        # runs synchronously inside assemble_multi_page_record — the merge is complete by now.
        if res_status in SUCCESS_STATUSES and res_status != 'FINALIZED':
            def _set_assembly_flags():
                from vouchers.coordinator import log_forensic_trace
                log_forensic_trace("assembly_flags_write_BEFORE", record_id, {
                    "assembly_complete": True, "continuation_merge_complete": True
                })
                try:
                    from django.db import transaction as _atx
                    with _atx.atomic():
                        b = SessionFinalizationState.objects.select_for_update().get(id=str(record_id))
                        fields = []
                        if not b.assembly_complete:
                            b.assembly_complete = True
                            fields.append('assembly_complete')
                        if not b.continuation_merge_complete:
                            b.continuation_merge_complete = True
                            fields.append('continuation_merge_complete')
                        if fields:
                            b.save(update_fields=fields)
                            logger.info(
                                f"[ASSEMBLY_FLAGS_COMMITTED] record={record_id} "
                                f"assembly_complete=True continuation_merge_complete=True"
                            )
                        else:
                            logger.info(f"[ASSEMBLY_FLAGS_ALREADY_SET] record={record_id} — monotonic")
                except Exception as _flag_err:
                    logger.error(f"[ASSEMBLY_FLAGS_WRITE_ERROR] record={record_id} error={_flag_err}")
                log_forensic_trace("assembly_flags_write_AFTER", record_id)

            await asyncio.shield(loop.run_in_executor(None, _set_assembly_flags))

        if res_status not in SUCCESS_STATUSES:
            final_status = "FAILED"
            is_failed_assembly = True
        else:
            if res_status == 'FINALIZED':
                logger.info(f"[ASSEMBLY_IDEMPOTENT_EXIT] record={record_id} - already finalized by another thread. Bypassing duplicate finalize emission.")
                return
                
            strict_mode = payload.get('strict_mode', True)
            if final_f > 0:
                if strict_mode:
                    logger.error(f"[ASSEMBLY_ABORTED] record={record_id} reason=strict_mode_failed_page")
                    final_status = "FAILED"
                    is_failed_assembly = True
                else:
                    final_status = "PARTIAL_FAILED"
                    is_failed_assembly = False
            elif final_p > 0:
                final_status = "PARTIAL_FAILED"
                is_failed_assembly = False
            else:
                final_status = "READY_FOR_REVIEW"
                is_failed_assembly = False


        if not is_failed_assembly:
            logger.info(f"[ASSEMBLY_SUCCESS] record={record_id} status={final_status} res_status={res_status}")
            logger.info(f"[FILE_TERMINAL_SUCCESS] record={record_id} status={final_status}")
            await asyncio.shield(loop.run_in_executor(
                None,
                lambda: orchestrator.update_session_status(record_id, final_status, progress=100.0)
            ))
        else:
            logger.error(f"[ASSEMBLY_TERMINAL_FAILURE] record={record_id} status={res_status}")
            logger.error(f"[FILE_TERMINAL_FAILED] record={record_id} status=FAILED reason={res_status}")
            def _safe_save_failed():
                InvoiceTempOCR.objects.filter(id=record_id).update(
                    status=PipelineStatus.FAILED,
                    validation_status='ERROR'
                )
            await asyncio.shield(loop.run_in_executor(
                None,
                _safe_save_failed
            ))
            await asyncio.shield(loop.run_in_executor(
                None,
                lambda: orchestrator.update_session_status(record_id, "FAILED", progress=100.0)
            ))

        logger.info(f"[JOB_BARRIER_COMPLETE] record={record_id}")

        # 5. Enqueue FINALIZE task
        from vouchers.message_factory import message_factory
        from core.sqs import queue_service
        from copy import deepcopy
        from vouchers.coordinator import log_forensic_trace

        finalize_msg = message_factory.create_message(
            task_type="FINALIZE",
            tenant_id=tenant_id,
            session_id=session_id,
            payload={
                "record_id": record_id,
                "job_id": job_id,
                "item_id": item_id,
                "failed": is_failed_assembly,
            }
        )
        finalize_msg_copy = deepcopy(finalize_msg)
        logger.info(f"[FINALIZE_ENQUEUE_START] record={record_id} session={session_id} failed={is_failed_assembly} msg_id={finalize_msg_copy['id']}")
        logger.info(f"[FINALIZE_TRIGGER] record={record_id} session={session_id} failed={is_failed_assembly}")

        log_forensic_trace("finalize_enqueue_BEFORE", record_id, f"msg_id={finalize_msg_copy['id']}")
        try:
            queue_service.push(finalize_msg_copy, queue_type='finalize')
            log_forensic_trace("finalize_enqueue_AFTER", record_id, f"msg_id={finalize_msg_copy['id']}")
            logger.info(f"[ONE_SHOT_FINALIZE_CONFIRMED] record={record_id} msg_id={finalize_msg_copy['id']}")
            logger.info(f"[DOWNSTREAM_ENQUEUE_SUCCESS] target_queue=finalize msg_id={finalize_msg_copy['id']}")
            logger.info(f"[FINALIZE_ENQUEUED] record={record_id}")
            logger.info(f"[ASSEMBLY_FINALIZED] record={record_id}")
        except Exception as e:
            logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=finalize error={e}")
            raise

        logger.info(f"[ASSEMBLY_TASK_EXIT] record={record_id}")
