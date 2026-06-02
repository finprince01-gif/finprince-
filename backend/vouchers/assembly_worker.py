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

# Hard barrier timeout: if not all pages arrive within this window, force-release
ASSEMBLY_BARRIER_TIMEOUT_SECONDS = 120


class AssemblyWorker(BaseWorker):
    """
    Handles barrier synchronization and merging of multi-page invoice data.
    Role: ASSEMBLY
    Queue: assembly

    DEADLOCK PREVENTION:
    - Hard 120s barrier timeout: missing pages are auto-failed, finalize always runs.
    - tenant_id/session_id resolved from task root, not from inner payload.
    - Finalize is enqueued for ALL terminal states (success, partial, full failure).
    """
    def __init__(self):
        super().__init__(role="ASSEMBLY", queue_type=os.getenv('SQS_ASSEMBLY_QUEUE_TYPE', 'assembly'))
        self.allowed_task_types = ['ASSEMBLY']

    async def handle_task(self, task: Dict[str, Any]):
        # [PHASE 11.5] Unwrap canonical payload
        payload = task['payload']
        record_id = payload.get('record_id')
        page_idx = payload.get('page_index') or task.get('page_number')

        # BUG FIX: tenant_id and session_id MUST come from task root, not inner payload.
        # The inner payload (assembly_payload) only contains record_id, page_index, etc.
        # The outer message envelope carries tenant_id, session_id, correlation_id.
        session_id = task.get('session_id') or task.get('upload_session_id') or payload.get('session_id') or "system"
        tenant_id = task.get('tenant_id') or payload.get('tenant_id') or "system"
        correlation_id = task.get('correlation_id', 'unknown')
        job_id = payload.get('job_id') or task.get('job_id', 'unknown')
        item_id = payload.get('item_id') or task.get('item_id')

        logger.info(f"[CONTEXT_TRACE_ASSEMBLY_RECEIVE] job_id={job_id} record_id={record_id} session_id={session_id} tenant_id={tenant_id} trace_id={task.get('trace_id')} page={page_idx}")

        logger.info(f"[ASSEMBLY_TASK_ENTER] record={record_id} page={page_idx} correlation_id={correlation_id} session={session_id} tenant={tenant_id}")

        loop = asyncio.get_running_loop()

        # 1. Fetch page result from DB
        try:
            logger.info(f"[ASSEMBLY_EXECUTOR_START] role=ASSEMBLY action=FETCH_RESULT record={record_id}")
            res_obj = await asyncio.shield(loop.run_in_executor(
                None,
                lambda: InvoicePageResult.objects.filter(record_id=record_id, page_number=page_idx).first()
            ))
            logger.info(f"[ASSEMBLY_EXECUTOR_DONE] role=ASSEMBLY action=FETCH_RESULT record={record_id}")
        except asyncio.CancelledError:
            logger.error(f"[ASSEMBLY_TASK_CANCEL] record={record_id} page={page_idx} during DB_FETCH.")
            raise

        if not res_obj:
            logger.error(
                f"[ASSEMBLY_MISSING_DATA] record={record_id} page={page_idx} correlation_id={correlation_id} "
                f"— no InvoicePageResult found. Registering as FAILED so barrier can complete."
            )
            # [FIX] Register this page as failed in both DB and Redis barrier so the barrier
            # count still reaches expected_pages and finalize is not permanently blocked.
            def _register_missing_page():
                from django.db import transaction as _tx
                with _tx.atomic():
                    InvoicePageResult.objects.get_or_create(
                        record_id=record_id,
                        page_number=page_idx,
                        defaults={
                            'is_failed': True,
                            'canonical_payload': {'error': 'ASSEMBLY_NO_PAGE_RESULT'},
                            'session_id': session_id,
                        }
                    )
            await asyncio.shield(loop.run_in_executor(None, _register_missing_page))
            from core.redis_orchestrator import orchestrator
            await asyncio.shield(loop.run_in_executor(
                None,
                lambda: orchestrator.register_page_completion(record_id, page_idx, is_failed=True)
            ))
            logger.info(f"[ASSEMBLY_MISSING_PAGE_REGISTERED] record={record_id} page={page_idx} as FAILED")
            # Re-read res_obj as failed so downstream barrier logic proceeds correctly
            res_obj = await asyncio.shield(loop.run_in_executor(
                None,
                lambda: InvoicePageResult.objects.filter(record_id=record_id, page_number=page_idx).first()
            ))
            if not res_obj:
                logger.critical(f"[ASSEMBLY_UNRECOVERABLE] record={record_id} page={page_idx} — cannot register missing page. Aborting.")
                return


        # 2. Redis Barrier increment — ASSEMBLY is sole owner
        from core.redis_orchestrator import orchestrator

        logger.info(f"[ASSEMBLY_BARRIER_INCREMENT] record={record_id} page={page_idx} is_failed={res_obj.is_failed}")
        await asyncio.shield(loop.run_in_executor(
            None,
            lambda: orchestrator.register_page_completion(record_id, page_idx, is_failed=res_obj.is_failed)
        ))

        # 3. Fetch barrier state
        barrier, created = await asyncio.shield(loop.run_in_executor(
            None,
            lambda: SessionFinalizationState.objects.get_or_create(id=str(record_id))
        ))
        if created:
            logger.info(f"[ASSEMBLY_BARRIER_CREATED] record={record_id} expected_pages={barrier.expected_pages}")

        expected_pages = barrier.expected_pages
        state = await asyncio.shield(loop.run_in_executor(
            None, 
            lambda: orchestrator.get_barrier_state(record_id, expected_pages)
        ))
        if not state:
            logger.error(f"[REDIS_BARRIER_FAIL] record={record_id} correlation_id={correlation_id} — barrier state missing from Redis")
            return

        logger.info(f"[ASSEMBLY_BARRIER_PROGRESS] record={record_id} progress={state['total']}/{state['expected']} failed={state['failed']}")
        logger.info(f"[ASSEMBLY_EXPECTED_PAGES] record={record_id} expected={expected_pages}")
        logger.info(f"[ASSEMBLY_RECEIVED_PAGES] record={record_id} received={state['total']}")

        # 4. Hard Barrier Timeout Check (PHASE 2 — deadlock prevention)
        # Prevent premature finalization: dynamic timeout based on page count
        timeout_seconds = max(120, expected_pages * 30)
        duration = (timezone.now() - barrier.created_at).total_seconds()
        
        if not state["is_ready"] and duration > timeout_seconds:
            logger.warning(
                f"[ASSEMBLY_TIMEOUT_RELEASE] record={record_id} duration_seconds={int(duration)} "
                f"expected_pages={expected_pages} completed_pages={state['total']} "
                f"— forcing partial release (timeout={timeout_seconds}s)"
            )

            # Identify missing pages
            completed_page_numbers = await loop.run_in_executor(
                None,
                lambda: list(InvoicePageResult.objects.filter(record_id=record_id).values_list('page_number', flat=True))
            )
            all_pages = set(range(1, expected_pages + 1))
            missing_pages = all_pages - set(completed_page_numbers)
            logger.warning(f"[ASSEMBLY_PARTIAL_RELEASE] record={record_id} missing_pages={sorted(missing_pages)}")

            # Persist FAILED result for each missing page so downstream schemas are consistent
            def persist_missing_failures():
                with transaction.atomic():
                    for missing_p in missing_pages:
                        InvoicePageResult.objects.get_or_create(
                            record_id=record_id,
                            page_number=missing_p,
                            defaults={
                                'is_failed': True,
                                'canonical_payload': {'error': "BARRIER_TIMEOUT_AUTO_FAIL"},
                                'session_id': session_id,
                            }
                        )
            await loop.run_in_executor(None, persist_missing_failures)

            # Register each missing page as failed in Redis barrier
            for missing_p in missing_pages:
                await loop.run_in_executor(
                    None,
                    lambda mp=missing_p: orchestrator.register_page_completion(record_id, mp, is_failed=True)
                )

            # Refresh state and force-ready
            state = await asyncio.shield(loop.run_in_executor(
                None,
                lambda: orchestrator.get_barrier_state(record_id, expected_pages)
            )) or state
            state["is_ready"] = True
            logger.info(f"[ASSEMBLY_BARRIER_WAIT] record={record_id} forced_ready=True after timeout")

        # 5. Barrier not yet ready — log progress and return
        if not state["is_ready"]:
            logger.info(
                f"[ASSEMBLY_BARRIER_WAIT] record={record_id} page={page_idx} "
                f"completed={state['total']}/{state['expected']} duration={int(duration)}s"
            )
            progress = (state['total'] / state['expected']) * 100 if state['expected'] > 0 else 0
            await asyncio.shield(loop.run_in_executor(
                None,
                lambda: orchestrator.update_session_status(record_id, "PROCESSING", progress=progress)
            ))

            # Early stall warning at 45s
            if duration > 45:
                completed_page_numbers = await loop.run_in_executor(
                    None,
                    lambda: list(InvoicePageResult.objects.filter(record_id=record_id).values_list('page_number', flat=True))
                )
                all_pages = set(range(1, expected_pages + 1))
                missing_pages = all_pages - set(completed_page_numbers)
                logger.error(
                    f"[PAGE_STALLED] record={record_id} duration_seconds={int(duration)} "
                    f"expected_pages={expected_pages} completed_pages={len(completed_page_numbers)} "
                    f"missing={sorted(missing_pages)}"
                )
            return

        # 6. Barrier is ready — acquire finalize lock and proceed
        logger.info(f"[ASSEMBLY_BARRIER_RELEASE] record={record_id} expected_pages={expected_pages} total_received={state['total']} failed={state['failed']}")
        logger.info(f"[BARRIER_TERMINAL_REACHED] record={record_id} correlation_id={correlation_id}")
        logger.info(f"[BARRIER_COMPLETE] record={record_id}")

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

        # 7. Run assembly merge (force=True to prevent deadlock if DB rows are missing)
        logger.info(f"[ASSEMBLY_EXECUTOR_START] role=ASSEMBLY action=MERGE record={record_id}")
        result = await asyncio.shield(loop.run_in_executor(
            self.executor,
            lambda: assemble_multi_page_record(record, job_id=job_id, item_id=item_id, force=True)
        ))
        logger.info(f"[ASSEMBLY_EXECUTOR_DONE] role=ASSEMBLY action=MERGE record={record_id}")

        res_status = result.get('status') if isinstance(result, dict) else None
        logger.info(f"[ASSEMBLY_COMPLETE] record={record_id} status={res_status}")

        # [FIX] Fetch AUTHORITATIVE state after assembly reconciliation
        def _get_final_counts():
            # Pull directly from Redis to ensure we see the post-reconciliation states
            page_states = orchestrator.redis.hgetall(f"assembly:{record_id}:page_states") or {}
            
            # [FIX 7] VALIDATE BARRIER CONSISTENCY
            derived_total = len(page_states)
            terminal_states = {"SUCCESS", "FAILED", "PARTIAL", "CONTINUATION"}
            derived_terminal = sum(1 for s in page_states.values() if s in terminal_states)
            
            if derived_total != expected_pages or derived_terminal != expected_pages:
                logger.error(f"[BARRIER_CORRUPTION_DETECTED] record={record_id} expected={expected_pages} derived_total={derived_total} derived_terminal={derived_terminal}")
                # We log but do not crash the pipeline if there's a lingering gap, to allow recovery
            
            c = sum(1 for s in page_states.values() if s == "SUCCESS")
            f = sum(1 for s in page_states.values() if s == "FAILED")
            p = sum(1 for s in page_states.values() if s == "PARTIAL")
            return c, f, p

        final_c, final_f, final_p = await asyncio.shield(loop.run_in_executor(None, _get_final_counts))

        # [PHASE 16] Persist barrier completion to DB for orchestrator aggregation
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

        # 8. Determine terminal state
        SUCCESS_STATUSES = {'FINALIZED', 'SUCCESS', 'SUCCESS_EMPTY_EXPORT'}
        
        # If it somehow still returns FAILED_MISSING_PAGES, treat it as a partial failure 
        if res_status == 'FAILED_MISSING_PAGES':
            logger.warning(f"[ASSEMBLY_MISSING_PAGES_FALLBACK] record={record_id} proceeding as PARTIAL_FAILED")
            final_status = "PARTIAL_FAILED"
            is_failed_assembly = False
        elif res_status not in SUCCESS_STATUSES:
            final_status = "FAILED"
            is_failed_assembly = True
        else:
            # [FIX 4] Evaluate final status ONLY from current authoritative states
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
            logger.error(f"[FAILED_STATE_SOURCE] record={record_id} source=ASSEMBLY_WORKER res_status={res_status} — will emit failed=True to FINALIZE")
            logger.error(f"[FAILED_STATE_REASON] record={record_id} reason=assembly_returned_non_success res_status={res_status}")
            logger.error(f"[FILE_TERMINAL_FAILED] record={record_id} status=FAILED reason={res_status}")
            record.status = PipelineStatus.FAILED
            await asyncio.shield(loop.run_in_executor(
                None,
                lambda: record.save(update_fields=['status'])
            ))
            await asyncio.shield(loop.run_in_executor(
                None,
                lambda: orchestrator.update_session_status(record_id, "FAILED", progress=100.0)
            ))

        logger.info(f"[JOB_BARRIER_COMPLETE] record={record_id}")

        # 9. ALWAYS enqueue FINALIZE — regardless of success/failure
        # Finalize worker handles both success and failure terminal transitions.
        from vouchers.message_factory import message_factory
        from core.sqs import queue_service
        from copy import deepcopy

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
        logger.info(f"[CONTEXT_TRACE_FINALIZE] job_id={job_id} record_id={record_id} session_id={session_id} tenant_id={tenant_id} trace_id={finalize_msg_copy['trace_id']}")

        try:
            queue_service.push(finalize_msg_copy, queue_type='finalize')
            logger.info(f"[DOWNSTREAM_ENQUEUE_SUCCESS] target_queue=finalize msg_id={finalize_msg_copy['id']}")
            logger.info(f"[FINALIZE_ENQUEUED] record={record_id}")
            logger.info(f"[ASSEMBLY_FINALIZED] record={record_id}")
        except Exception as e:
            logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=finalize error={e}")
            raise

        logger.info(f"[ASSEMBLY_TASK_EXIT] record={record_id} page={page_idx}")


if __name__ == "__main__":
    import django
    django.setup()
    worker = AssemblyWorker()
    asyncio.run(worker.run())
