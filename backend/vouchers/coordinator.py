import logging
import asyncio
import threading
import traceback
from django.db import transaction
from django.utils import timezone
from django.db import models

logger = logging.getLogger(__name__)

class ConvergenceCorruptionError(ValueError):
    pass

def get_execution_context_info():
    thread_name = threading.current_thread().name
    thread_id = threading.get_ident()
    try:
        asyncio.get_running_loop()
        ctx = "ASYNC"
    except RuntimeError:
        ctx = "SYNC"
    return f"ctx={ctx} thread={thread_name} (id={thread_id})"

def log_forensic_trace(event, record_id, details=None):
    ctx_info = get_execution_context_info()
    details_str = f" | details={details}" if details else ""
    logger.info(f"[FORENSIC_TRACE] event={event} record={record_id} {ctx_info}{details_str}")

def check_and_trigger_assembly(record_id, tenant_id, session_id, correlation_id, job_id, item_id):
    """
    Synchronous coordinator. MUST be called on a synchronous thread context.
    Checks DB barrier status and triggers multi-page assembly exactly once when complete.
    """
    from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult
    from vouchers.message_factory import message_factory
    from core.sqs import queue_service
    from copy import deepcopy

    if not record_id or record_id == 'unknown':
        return

    log_forensic_trace("check_and_trigger_assembly_BEFORE", record_id, {
        "tenant_id": tenant_id, "session_id": session_id, "correlation_id": correlation_id, "job_id": job_id
    })

    already_emitted = False
    try:
        # Enforce that this runs inside a synchronous execution context (no async ORM check)
        try:
            asyncio.get_running_loop()
            logger.warning(f"[ASYNC_ORM_VIOLATION_WARNING] check_and_trigger_assembly is executing directly inside an asyncio loop! record={record_id}")
        except RuntimeError:
            pass

        with transaction.atomic():
            barrier = SessionFinalizationState.objects.select_for_update().get(id=str(record_id))

            # [FORENSIC] Log barrier state on every convergence check
            db_completed = barrier.completed_pages or 0
            db_failed = barrier.failed_pages or 0
            expected = barrier.expected_pages or 0
            barrier_total = db_completed + db_failed
            logger.critical(
                f"[SESSION_BARRIER_STATE] "
                f"record={record_id} session={session_id} "
                f"expected={expected} completed={db_completed} "
                f"failed={db_failed} total={barrier_total} "
                f"ai_complete={barrier.ai_complete} "
                f"[FINALIZE_TRIGGER_ENTER]"
            )

            # Check if assembly has already been emitted (idempotency guard)
            if barrier.ai_complete:
                already_emitted = True
                log_forensic_trace("assembly_bypass_already_emitted", record_id)
                logger.info(f"[FINALIZE_ALREADY_COMPLETE] record={record_id} — ai_complete=True, skipping")
                return

            # [FIX] Use ONLY the DB barrier counters (completed_pages + failed_pages from select_for_update).
            # Do NOT use InvoicePageResult.count() — it has a stale-read race when called immediately
            # after terminalize_page_state() commits, because InvoicePageResult INSERT may not yet be
            # visible in the outer transaction's read set depending on isolation level.
            # The barrier counters are authoritative — they are incremented atomically inside
            # terminalize_page_state's own transaction which commits BEFORE this function is called.
            enqueued_count = barrier.total_pages_completed

            log_forensic_trace("barrier_counter_check", record_id, {
                "expected": expected, "db_completed": db_completed,
                "db_failed": db_failed, "barrier_total": barrier_total
            })

            # [FINALIZE_BARRIER_CONFIRMED] — canonical convergence condition
            # completed_pages + failed_pages == expected_pages (DB-only, no Redis, no in-memory)
            if expected > 0 and barrier_total >= expected:
                logger.critical(
                    f"[FINALIZE_BARRIER_CONFIRMED] record={record_id} session={session_id} "
                    f"expected={expected} completed={db_completed} failed={db_failed} "
                    f"— emitting ASSEMBLY now"
                )
                # Mark as complete to prevent concurrent threads from duplicating
                barrier.ai_complete = True
                log_forensic_trace("barrier_counter_update_BEFORE", record_id, "marking ai_complete=True")
                barrier.save(update_fields=['ai_complete'])
                log_forensic_trace("barrier_counter_update_AFTER", record_id, "ai_complete=True saved")

                logger.info(f"[ONE_SHOT_ASSEMBLY_CONFIRMED] record={record_id} expected={expected} completed={db_completed} failed={db_failed}")

                # [FIX] Resolve a valid integer job_id from DB when not provided or invalid.
                # MessageFactory requires job_id — without this, ASSEMBLY is never pushed → permanent 99% deadlock.
                resolved_job_id = job_id
                try:
                    _is_valid_int = isinstance(resolved_job_id, int) or (
                        isinstance(resolved_job_id, str) and resolved_job_id.isdigit()
                    )
                    if not _is_valid_int:
                        from vouchers.models import InvoiceProcessingItem
                        _item = InvoiceProcessingItem.objects.filter(record_id=record_id).select_related('job').first()
                        if _item and _item.job_id:
                            resolved_job_id = _item.job_id
                            logger.info(f"[JOB_ID_RESOLVED_FROM_DB] record={record_id} job_id={resolved_job_id} via=InvoiceProcessingItem")
                        else:
                            # Try looking up via session_id
                            from vouchers.models import BulkInvoiceJob
                            _job = BulkInvoiceJob.objects.filter(upload_session_id=session_id).first()
                            if _job:
                                resolved_job_id = _job.id
                                logger.info(f"[JOB_ID_RESOLVED_FROM_SESSION] record={record_id} job_id={resolved_job_id} via=BulkInvoiceJob session={session_id}")
                            else:
                                logger.error(f"[JOB_ID_RESOLUTION_FAILED] record={record_id} session={session_id} — could not resolve job_id. ASSEMBLY may fail.")
                except Exception as _jid_err:
                    logger.error(f"[JOB_ID_RESOLUTION_ERROR] record={record_id} error={_jid_err}")

                # Emit ONE assembly task
                assembly_payload = {
                    "record_id": record_id,
                    "item_id": item_id,
                    "job_id": resolved_job_id,
                    "result": {"_db_persisted": True}
                }
                assembly_msg = message_factory.create_message(
                    task_type="ASSEMBLY",
                    tenant_id=tenant_id,
                    session_id=session_id,
                    payload=assembly_payload,
                    correlation_id=correlation_id,
                    page_number=expected
                )

                log_forensic_trace("assembly_enqueue_BEFORE", record_id, f"msg_id={assembly_msg.get('id')}")
                queue_service.push(deepcopy(assembly_msg), queue_type='assembly')
                log_forensic_trace("assembly_enqueue_AFTER", record_id, f"msg_id={assembly_msg.get('id')}")
                logger.info(f"[ASSEMBLY_MESSAGE_EMITTED] record={record_id} correlation_id={correlation_id} (Global Coordinator)")
                logger.info(f"[FINAL_CONVERGENCE_REACHED] record={record_id} expected={expected} completed={db_completed} failed={db_failed}")
                logger.critical(f"[FINALIZE_SESSION_TERMINALIZED] record={record_id} session={session_id} — assembly emitted, hydration will release after finalize")
            else:
                log_forensic_trace("assembly_blocked_partial_barrier", record_id, {
                    "expected": expected, "db_completed": db_completed, "db_failed": db_failed
                })
                if expected > 0 and barrier_total < expected:
                    remaining = expected - barrier_total
                    logger.info(
                        f"[BARRIER_PARTIAL] record={record_id} expected={expected} "
                        f"completed={db_completed} failed={db_failed} remaining={remaining} "
                        f"[ORPHAN_SCAN_DEFERRED — awaiting full barrier completion]"
                    )
    except Exception as e:
        logger.critical(f"[GLOBAL_COORDINATOR_ERROR] record={record_id} error={e}\ntrace={traceback.format_exc()} {get_execution_context_info()}")
        
        # [FAIL-OPEN ORCHESTRATION] Fallback direct emission
        if not already_emitted:
            logger.warning(f"[COORDINATOR_CRASH_FALLBACK_EMISSION] record={record_id} - Attempting direct assembly message push to prevent pipeline freeze")
            try:
                assembly_payload = {
                    "record_id": record_id,
                    "item_id": item_id,
                    "job_id": job_id,
                    "result": {"_db_persisted": True, "_fallback_emitted": True}
                }
                assembly_msg = message_factory.create_message(
                    task_type="ASSEMBLY",
                    tenant_id=tenant_id,
                    session_id=session_id,
                    payload=assembly_payload,
                    correlation_id=correlation_id,
                )
                log_forensic_trace("assembly_enqueue_BEFORE", record_id, f"msg_id={assembly_msg.get('id')} (FALLBACK)")
                queue_service.push(deepcopy(assembly_msg), queue_type='assembly')
                log_forensic_trace("assembly_enqueue_AFTER", record_id, f"msg_id={assembly_msg.get('id')} (FALLBACK)")
                logger.info(f"[ASSEMBLY_FALLBACK_EMITTED] record={record_id} msg_id={assembly_msg['id']}")
            except Exception as fallback_err:
                logger.error(f"[COORDINATOR_FALLBACK_FAILED] record={record_id} error={fallback_err}")
    finally:
        log_forensic_trace("check_and_trigger_assembly_AFTER", record_id)


def terminalize_page_state(
    record_id,
    page_number,
    session_id,
    is_failed,
    canonical_payload,
    worker_id="AIWorker",
    queue_source="ai_queue",
    tenant_id=None,
    correlation_id=None,
    job_id=None,
    item_id=None,
):
    """
    [PHASE 18] STRICT CANONICAL PAGE TERMINALIZATION.
    The ONLY function authorized to persist page outcomes and mutate convergence counters.
    Enforces the strict convergence invariant: completed_pages + failed_pages <= expected_pages.
    """
    from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult
    from django.db import transaction
    
    logger.info(
        f"[CANONICAL_TERMINALIZATION] record={record_id} page={page_number} "
        f"is_failed={is_failed} worker={worker_id} queue={queue_source} "
        f"tenant={tenant_id} correlation={correlation_id} job={job_id} item={item_id}"
    )

    with transaction.atomic():
        barrier = SessionFinalizationState.objects.select_for_update().get(id=str(record_id))
        
        # Check if this page was already counted
        res_obj, created = InvoicePageResult.objects.get_or_create(
            record_id=record_id,
            page_number=page_number,
            defaults={
                'session_id': session_id,
                'is_failed': is_failed,
                'canonical_payload': canonical_payload,
                'counted_in_barrier': False
            }
        )
        
        # If not created, update the fields if it wasn't counted yet
        if not created and not res_obj.counted_in_barrier:
            res_obj.is_failed = is_failed
            res_obj.canonical_payload = canonical_payload
            res_obj.session_id = session_id
            res_obj.save()

        if not res_obj.counted_in_barrier:
            # Enforce convergence overflow check
            current_completed = barrier.completed_pages or 0
            current_failed = barrier.failed_pages or 0
            expected = barrier.expected_pages or 0
            
            if current_completed + current_failed + 1 > expected:
                logger.error(
                    f"[CONVERGENCE_OVERFLOW_BLOCKED] record={record_id} page={page_number} "
                    f"expected={expected} current_completed={current_completed} current_failed={current_failed}"
                )
                raise ConvergenceCorruptionError(
                    f"Convergence overflow: expected={expected}, computed={current_completed + current_failed + 1} for record {record_id}"
                )
            
            # Increment the database counters
            if is_failed:
                barrier.failed_pages = models.F('failed_pages') + 1
            else:
                barrier.completed_pages = models.F('completed_pages') + 1
                
            barrier.ai_completed_pages = models.F('ai_completed_pages') + 1
            barrier.save(update_fields=['failed_pages', 'completed_pages', 'ai_completed_pages'])
            
            res_obj.counted_in_barrier = True
            res_obj.save(update_fields=['counted_in_barrier'])
            
            # Reload barrier to get actual committed values (F()-expressions resolve after save)
            barrier.refresh_from_db()
            logger.info(
                f"[CANONICAL_BARRIER_REACHED] record={record_id} page={page_number} "
                f"expected={barrier.expected_pages} completed={barrier.completed_pages} failed={barrier.failed_pages}"
            )
            logger.critical(
                f"[SESSION_BARRIER_STATE] "
                f"record={record_id} session={session_id} "
                f"expected={barrier.expected_pages} completed={barrier.completed_pages} "
                f"failed={barrier.failed_pages} "
                f"ai_complete={barrier.ai_complete} "
                f"[POST_TERMINALIZE]"
            )

    # [FIX — ROOT CAUSE 2] Trigger convergence check AFTER the terminalize transaction commits.
    # This is the missing call-site: ai_worker._persist() calls terminalize_page_state() but
    # never calls check_and_trigger_assembly() afterward. Without this, the final page commits
    # its barrier increment but nothing evaluates whether the barrier is now complete.
    # Result: permanent 99% deadlock — every upload.
    #
    # We call check_and_trigger_assembly() OUTSIDE the terminalize transaction so the coordinator
    # reads the fully-committed barrier counters with no stale-read risk.
    if not is_failed or True:  # Always evaluate — failed pages also complete the barrier
        try:
            from vouchers.message_factory import message_factory
            from core.sqs import queue_service
            from copy import deepcopy
            import threading, asyncio

            # Resolve context kwargs for the coordinator
            _coord_tenant = tenant_id
            _coord_session = session_id
            _coord_correlation = correlation_id or f"terminalize_{record_id}_{page_number}"
            _coord_job = job_id
            _coord_item = item_id

            logger.info(
                f"[FINALIZE_TRIGGER_ENTER] record={record_id} page={page_number} "
                f"is_failed={is_failed} — evaluating convergence post-commit"
            )

            # Re-read barrier counts POST-commit (outside the terminated transaction)
            from ocr_pipeline.models import SessionFinalizationState as _SFS
            _barrier = _SFS.objects.filter(id=str(record_id)).values(
                'expected_pages', 'completed_pages', 'failed_pages', 'ai_complete'
            ).first()

            if _barrier:
                _expected = _barrier['expected_pages'] or 0
                _completed = _barrier['completed_pages'] or 0
                _failed = _barrier['failed_pages'] or 0
                _ai_complete = _barrier['ai_complete']
                _barrier_total = _completed + _failed

                logger.critical(
                    f"[SESSION_BARRIER_STATE] "
                    f"record={record_id} session={session_id} "
                    f"expected={_expected} completed={_completed} "
                    f"failed={_failed} total={_barrier_total} "
                    f"ai_complete={_ai_complete} "
                    f"[PRE_CONVERGENCE_EVAL]"
                )

                if _expected > 0 and _barrier_total >= _expected and not _ai_complete:
                    logger.critical(
                        f"[FINALIZE_BARRIER_CONFIRMED] record={record_id} session={session_id} "
                        f"expected={_expected} completed={_completed} failed={_failed} "
                        f"— invoking check_and_trigger_assembly from terminalize"
                    )
                    # Use a thread to avoid any async-context issues
                    def _trigger():
                        try:
                            check_and_trigger_assembly(
                                record_id=str(record_id),
                                tenant_id=_coord_tenant,
                                session_id=_coord_session,
                                correlation_id=_coord_correlation,
                                job_id=_coord_job,
                                item_id=_coord_item,
                            )
                            logger.info(f"[FINALIZE_TRIGGER_EXIT] record={record_id} page={page_number} — convergence eval complete")
                        except Exception as _te:
                            logger.error(f"[FINALIZE_TRIGGER_ERROR] record={record_id} page={page_number} error={_te}")
                    t = threading.Thread(target=_trigger, daemon=True, name=f"conv_eval_{record_id}_{page_number}")
                    t.start()
                elif _ai_complete:
                    logger.info(f"[FINALIZE_ALREADY_COMPLETE] record={record_id} — ai_complete already True, skip")
                else:
                    remaining = _expected - _barrier_total
                    logger.info(
                        f"[FINALIZE_TRIGGER_EXIT] record={record_id} page={page_number} "
                        f"barrier_total={_barrier_total}/{_expected} remaining={remaining} — not yet complete"
                    )
        except Exception as _conv_err:
            logger.error(f"[FINALIZE_TRIGGER_ERROR] record={record_id} page={page_number} convergence eval error={_conv_err}")
