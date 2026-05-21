import asyncio
import os
import sys
import signal
import time
import logging
import platform
import uuid
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, List

from django.utils import timezone
from core.sqs import queue_service
from core.observability import observability, metrics

logger = logging.getLogger(__name__)

CONCURRENCY_LIMIT = int(os.getenv('WORKER_CONCURRENCY', '50'))
LEASE_EXTENSION_INTERVAL = int(os.getenv('SQS_LEASE_EXTEND_INTERVAL', '60'))

class SqsLeaseExtender:
    def __init__(self, handle: str, queue_type: str, interval: int = 60):
        self.handle = handle
        self.queue_type = queue_type
        self.interval = interval
        self.running = True
        self._task = None

    async def __aenter__(self):
        if self.handle:
            logger.debug(f"[SQS_VISIBILITY_START] handle={self.handle[:10]}... queue={self.queue_type}")
            # Ensure the extender task itself is shielded from cancellation 
            # if the outer task is cancelled but we are in the middle of a heartbeat.
            self._task = asyncio.create_task(self._extend_loop())
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _extend_loop(self):
        while self.running:
            try:
                await asyncio.sleep(self.interval)
                if self.running:
                    loop = asyncio.get_running_loop()
                    # Shield the heartbeat itself
                    logger.info(f"[QUEUE_VISIBILITY_TIMEOUT] Extending visibility for message handle={self.handle[:10]} queue={self.queue_type}")
                    logger.info(f"[VISIBILITY_TIMEOUT_EXTENDED] Extending visibility for message handle={self.handle[:10]} queue={self.queue_type}")
                    await asyncio.shield(loop.run_in_executor(
                        None,
                        lambda: queue_service.change_visibility(
                            self.handle,
                            timeout=300,
                            queue_type=self.queue_type
                        )
                    ))
                    logger.debug(f"[VISIBILITY_HEARTBEAT] role={self.queue_type} handle={self.handle[:10]}...")
            except asyncio.CancelledError:
                logger.info(f"[VISIBILITY_EXTENDER_CANCEL] role={self.queue_type}")
                break
            except Exception as e:
                logger.error(f"[LEASE_EXTEND_ERR] {e}")
                break

class BaseWorker(ABC):
    def __init__(self, role: str, queue_type: str):
        self.role = role
        self.queue_type = queue_type
        self.executor = ThreadPoolExecutor(max_workers=CONCURRENCY_LIMIT)
        self.semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)
        self.running = True
        self.active_tasks = {} # taskId -> asyncio.Task
        self.allowed_task_types = [] # Must be set by subclass
        self.last_task_time = time.time()
        self._stop_event = asyncio.Event()
        
        # CHAOS_MODE for Phase 10
        self.chaos_mode = os.getenv('CHAOS_MODE', 'False').lower() == 'true'
        self.chaos_crash_rate = float(os.getenv('CHAOS_CRASH_RATE', '0.0'))
        self.chaos_latency_ms = int(os.getenv('CHAOS_LATENCY_MS', '0'))
        
        # [PHASE 11.7: ROLE OWNERSHIP VALIDATION]
        # Fail fast if this worker's role does not have a physical queue mapped.
        queue_url = queue_service._get_queue_url(self.queue_type)
        if not queue_url:
             logger.critical(f"[ROLE_OWNERSHIP_FAILED] role={self.role} queue={self.queue_type} has no physical URL mapping. Aborting.")
             raise RuntimeError(f"Worker {self.role} cannot start: Missing physical queue mapping for {self.queue_type}")
        
        logger.info(f"[ROLE_OWNERSHIP_VALID] role={self.role} queue={self.queue_type} physical_url={queue_url}")
        
        # Start background health/resource monitor
        self._monitor_task = None

    def shutdown(self, signum=None, frame=None):
        # [PHASE 11.9] Forensic: Capture signal source
        logger.info(f"[SHUTDOWN_TRIGGERED] role={self.role} signal={signum} frame={frame}")
        self.running = False
        self._stop_event.set()

    def _register_signals(self):
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                signal.signal(sig, self.shutdown)
                logger.debug(f"[SIGNAL_HANDLER_REGISTERED] role={self.role} sig={sig}")
            except (ValueError, OSError):
                pass

    @abstractmethod
    async def handle_task(self, task: Dict[str, Any]):
        pass

    async def run(self):
        # Autoreload protection (Phase 4)
        # Workers must NEVER run under Django's StatReloader / dev autoreload.
        # Use: python manage.py runserver --noreload
        is_autoreload = (
            os.environ.get('RUN_MAIN') == 'true' or
            os.environ.get('AUTORELOAD_ACTIVE') == 'true' or
            (any('runserver' in str(arg).lower() for arg in sys.argv) and not any('--noreload' in str(arg).lower() for arg in sys.argv))
        )
        if is_autoreload:
            logger.warning(
                f"[AUTORELOAD_BLOCKED] role={self.role} — Workers must not run under "
                "Django StatReloader. Start cluster separately: python start_cluster.py "
                "and use: python manage.py runserver --noreload"
            )
            return

        logger.info(f"[WORKER_BOOT_START] role={self.role} queue={self.queue_type} concurrency={CONCURRENCY_LIMIT}")
        self._register_signals()
        
        # Start resource monitor
        self._monitor_task = asyncio.create_task(self._resource_monitor())
        
        logger.info(f"[POLL_LOOP_ENTER] role={self.role}")
        logger.info(f"[WORKER_LOOP_STARTED] role={self.role}")
        
        while self.running:
            logger.info(f"[WORKER_POLLING] role={self.role} active={len(self.active_tasks)}")
            try:
                # [DB_STABILITY_FIX] Release stale DB connections at loop boundaries (Phase 3)
                from django.db import close_old_connections
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, close_old_connections)

                # [PHASE 3: DYNAMIC BACKPRESSURE]
                # If we are the ingestion worker, check AI queue depth
                current_limit = CONCURRENCY_LIMIT
                if self.role == "INGESTION":
                    try:
                        ai_depth = queue_service.get_queue_depth('ai')
                        if ai_depth > 5000:
                            current_limit = max(1, CONCURRENCY_LIMIT // 4)
                            logger.warning(f"[DYNAMIC_BACKPRESSURE] AI queue depth = {ai_depth}. Throttling INGESTION concurrency to {current_limit}")
                        elif ai_depth > 2000:
                            current_limit = max(5, CONCURRENCY_LIMIT // 2)
                            logger.info(f"[DYNAMIC_BACKPRESSURE] AI queue depth = {ai_depth}. Throttling INGESTION concurrency to {current_limit}")
                    except Exception as e:
                        logger.error(f"[BACKPRESSURE_CHECK_FAIL] {e}")

                if len(self.active_tasks) >= current_limit:
                    await asyncio.sleep(0.5)
                    continue

                loop = asyncio.get_running_loop()
                
                # Receive messages
                # We use a 20s long-poll. This is the heart of the consumer.
                messages = await loop.run_in_executor(
                    self.executor,
                    lambda: queue_service.receive(
                        queue_type=self.queue_type,
                        max_messages=min(10, current_limit - len(self.active_tasks)),
                        wait_time=20
                    )
                )

                if not messages:
                    logger.info(f"[WORKER_IDLE_WAIT] role={self.role} queue={self.queue_type} status=EMPTY")
                    logger.info(f"[POLL_EMPTY_TICK] role={self.role} active={len(self.active_tasks)} running={self.running}")
                else:
                    for msg in messages:
                        msg_id = msg.get('_sqs_message_id', 'unknown')
                        task_id = msg.get('id', 'unknown')
                        logger.info(f"[WORKER_MESSAGE_RECEIVED] role={self.role} id={task_id} msg_id={msg_id}")
                        receive_count = msg.get('_sqs_receive_count', 1)
                        
                        if int(receive_count) > 1:
                            logger.warning(f"[MESSAGE_REPLAY] id={msg.get('id')} receive_count={receive_count}")
                            logger.info(f"[WORKER_RECOVERED] role={self.role} id={msg.get('id')}")

                        logger.info(f"[EXECUTOR_SUBMIT] id={msg.get('id', 'unknown')} msg_id={msg_id}")
                        
                        task_obj = asyncio.create_task(self._safe_handle_task(msg))
                        self.active_tasks[msg_id] = task_obj
                        
                        def _on_done(t, mid=msg_id):
                            self.active_tasks.pop(mid, None)
                            try:
                                t.result() 
                                logger.info(f"[TASK_DONE] role={self.role} msg_id={mid}")
                            except asyncio.CancelledError:
                                logger.warning(f"[TASK_CANCELLED] role={self.role} msg_id={mid}")
                            except Exception as e:
                                logger.error(f"[TASK_EXCEPTION] role={self.role} msg_id={mid} error={e}")
                                
                        task_obj.add_done_callback(_on_done)
                        
                logger.info(f"[WORKER_LOOP_CONTINUES] role={self.role}")
                
            except asyncio.CancelledError:
                # [PHASE 11.9] Forensic: This is where premature exits happen.
                logger.info(f"[WORKER_LOOP_CANCELLED] role={self.role} running_flag={self.running}")
                if self.running:
                    logger.warning(f"[WORKER_RECOVERY] role={self.role} - Spurious cancellation detected. Restarting loop...")
                    await asyncio.sleep(1)
                    continue
                else:
                    logger.info(f"[WORKER_SHUTDOWN_CANCEL] role={self.role} - Expected cancellation during shutdown.")
                    break
            except Exception as e:
                logger.error(f"[POLL_ERR] role={self.role} error={e}")
                # [DB_STABILITY_FIX] Release stale DB connections on loop exception (Phase 3)
                from django.db import close_old_connections
                await loop.run_in_executor(None, close_old_connections)
                await asyncio.sleep(5)
        
        # [PHASE 11.9] Forensic: Log why we exited the loop
        logger.info(f"[POLL_LOOP_EXITED] role={self.role} running={self.running} active_tasks={len(self.active_tasks)}")
        
        # [PHASE 11.9] Graceful Shutdown: Wait for active tasks to finish
        if self.active_tasks:
            logger.info(f"[SHUTDOWN_WAIT] role={self.role} waiting for {len(self.active_tasks)} active tasks...")
            try:
                # Shield the wait itself to prevent asyncio.run from killing it
                await asyncio.wait([asyncio.shield(t) for t in self.active_tasks.values()], timeout=30)
            except Exception as e:
                logger.error(f"[SHUTDOWN_ERR] Error during graceful wait: {e}")
        
        if self._monitor_task:
            self._monitor_task.cancel()
            
        logger.info(f"[WORKER_FINAL_EXIT] role={self.role}")

    async def _resource_monitor(self):
        """[WORKER_RESOURCE] - Background telemetry."""
        while self.running:
            try:
                # Basic health heartbeat
                metrics.increment_counter("worker:heartbeat_total", tags={"role": self.role})
                
                try:
                    import psutil
                    process = psutil.Process(os.getpid())
                    mem = process.memory_info().rss / 1024 / 1024 # MB
                    cpu = process.cpu_percent(interval=None) # Non-blocking call
                    
                    # Log resource usage at DEBUG level to reduce noise
                    logger.debug(f"[WORKER_RESOURCE] role={self.role} cpu={cpu} rss_mb={mem} active={len(self.active_tasks)}")
                    metrics.set_gauge("worker:cpu", cpu, tags={"role": self.role})
                    metrics.set_gauge("worker:rss", mem, tags={"role": self.role})
                except ImportError:
                    pass # psutil not installed
                
                metrics.set_gauge("worker:active_tasks", len(self.active_tasks), tags={"role": self.role})

                # [DB_CONNECTION_FORENSICS] SHOW PROCESSLIST instrument (Phase 4)
                try:
                    from django.db import connection, close_old_connections
                    def query_processlist():
                        close_old_connections()
                        with connection.cursor() as cursor:
                            cursor.execute("SHOW PROCESSLIST")
                            columns = [col[0] for col in cursor.description]
                            return [dict(zip(columns, row)) for row in cursor.fetchall()]
                    
                    loop = asyncio.get_running_loop()
                    processes = await loop.run_in_executor(self.executor, query_processlist)
                    
                    total_conn = len(processes)
                    sleeping_conn = sum(1 for p in processes if p.get('Command') == 'Sleep')
                    active_conn = total_conn - sleeping_conn
                    
                    logger.info(
                        f"[DB_CONNECTION_FORENSICS] role={self.role} PID={os.getpid()} "
                        f"total_connections={total_conn} sleeping_connections={sleeping_conn} "
                        f"active_connections={active_conn}"
                    )
                except Exception as db_err:
                    logger.error(f"[DB_FORENSICS_ERR] {db_err}")
                finally:
                    from django.db import close_old_connections
                    # Ensure background monitor connection is released immediately
                    await loop.run_in_executor(None, close_old_connections)

                await asyncio.sleep(15)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[RESOURCE_MONITOR_ERR] {e}")
                await asyncio.sleep(30)

    async def _safe_handle_task(self, raw_task: Dict[str, Any]):
        msg_id = raw_task.get('_sqs_message_id', 'unknown')
        handle = raw_task.get('_sqs_handle')
        t_start = time.time()
        task_id = 'unknown'
        correlation_id = 'unknown'
        session_id = 'unknown'
        tenant_id = 'unknown'
        job_id = 'unknown'
        record_id = 'unknown'
        invoice_no = 'unknown'
        queue_name = self.queue_type
        worker_id = self.role
        worker_pid = os.getpid()
        hostname = platform.node()
        retry_count = 1
        visibility_timeout = 300
        
        try:
            # [PHASE 11.5] STRICT MESSAGE PARSING
            from .message_parser import message_parser
            is_valid, task, error_reason = message_parser.parse(raw_task)
            
            if not is_valid:
                logger.error(f"[MESSAGE_SCHEMA_REJECTED] id={msg_id} reason={error_reason}")
                logger.error(f"[WORKER_STAGE_FAILURE] correlation_id={correlation_id} upload_session_id={session_id} tenant_id={tenant_id} job_id={job_id} record_id={record_id} invoice_no={invoice_no} queue_name={queue_name} worker_id={worker_id} worker_pid={worker_pid} hostname={hostname} retry_count={retry_count} visibility_timeout={visibility_timeout} processing_duration_ms=0 dto_status=REJECTED exception_class=SchemaValidationError exception_message='{error_reason}'")
                await self._quarantine_poison_document(raw_task, f"SCHEMA_INVALID: {error_reason}")
                if handle:
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, lambda: queue_service.delete(handle, queue_type=self.queue_type))
                    logger.info(f"[QUEUE_MESSAGE_DELETE] id={msg_id} queue={queue_name}")
                return

            correlation_id = task.get('correlation_id') or task.get('payload', {}).get('correlation_id') or 'unknown'
            task_type = task.get('task_type', 'unknown')
            task_id = task.get('id', 'unknown')
            receive_count = int(task.get('_sqs_receive_count', 1))
            retry_count = receive_count
            
            # Resolve all identifiers
            session_id = task.get('upload_session_id') or task.get('session_id') or task.get('payload', {}).get('upload_session_id') or 'unknown'
            tenant_id = task.get('tenant_id') or task.get('payload', {}).get('tenant_id') or 'unknown'
            job_id = task.get('job_id') or task.get('payload', {}).get('job_id') or 'unknown'
            record_id = task.get('record_id') or task.get('payload', {}).get('record_id') or 'unknown'
            invoice_no = task.get('invoice_no') or task.get('payload', {}).get('invoice_no') or 'unknown'

            logger.info(f"[QUEUE_MESSAGE_RECEIVED] correlation_id={correlation_id} session_id={session_id} job_id={job_id} record_id={record_id} page_number={task.get('page_number')} worker_name={self.role}")
            logger.info(f"[WORKER_MESSAGE_RECEIVED] correlation_id={correlation_id} upload_session_id={session_id} tenant_id={tenant_id} job_id={job_id} record_id={record_id} invoice_no={invoice_no} queue_name={queue_name} worker_id={worker_id} worker_pid={worker_pid} hostname={hostname} retry_count={retry_count} visibility_timeout={visibility_timeout}")
            logger.info(f"[MESSAGE_RECEIVED] id={task_id} queue={queue_name} correlation_id={correlation_id}")

            if receive_count >= 3:
                logger.warning(f"[ZOMBIE_MESSAGE_DETECTED] id={task_id} queue={queue_name} receive_count={receive_count}")
                logger.warning(f"[MESSAGE_RETRY_EXCEEDED] id={task_id} queue={queue_name} receive_count={receive_count}")
                logger.warning(f"[MESSAGE_DLQ_REDIRECT] id={task_id} queue={queue_name}")
                
                # Safe quarantine
                await self._quarantine_poison_document(task, f"Zombie message detected: receive_count={receive_count}")
                
                # Failure release path to prevent deadlocks:
                if record_id and record_id != 'unknown':
                    # If this is AI worker, write failed Page Result and forward to Assembly!
                    if self.role == "AI":
                        page_num = task.get('page_number') or task.get('payload', {}).get('page_index') or 1
                        def save_failed_page():
                            from ocr_pipeline.models import InvoicePageResult
                            InvoicePageResult.objects.get_or_create(
                                record_id=record_id,
                                page_number=page_num,
                                defaults={'is_failed': True, 'canonical_payload': {'error': "ZOMBIE_RELEASE_FALLBACK"}, 'session_id': session_id}
                            )
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(None, save_failed_page)
                        
                        # Enqueue assembly failure task so assembly barrier doesn't wait
                        from vouchers.message_factory import message_factory
                        from copy import deepcopy
                        assembly_msg = message_factory.create_message(
                            task_type="ASSEMBLY",
                            tenant_id=tenant_id,
                            session_id=session_id,
                            payload={"record_id": record_id, "page_index": page_num}
                        )
                        assembly_msg_copy = deepcopy(assembly_msg)
                        try:
                            queue_service.push(assembly_msg_copy, queue_type='assembly')
                            logger.info(f"[DOWNSTREAM_ENQUEUE_SUCCESS] target_queue=assembly msg_id={assembly_msg_copy['id']}")
                        except Exception as e:
                            logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=assembly error={e}")
                            
                if handle:
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, lambda: queue_service.delete(handle, queue_type=self.queue_type))
                    logger.info(f"[QUEUE_MESSAGE_DELETE] id={msg_id} queue={queue_name}")
                    logger.info(f"[MESSAGE_RELEASED] id={task_id} queue={queue_name}")
                return

            # Replay storm protection
            if receive_count > 10:
                logger.critical(f"[REPLAY_THRESHOLD_EXCEEDED] id={task_id} count={receive_count} role={self.role}")
                logger.error(f"[WORKER_MESSAGE_ABANDONED] correlation_id={correlation_id} upload_session_id={session_id} tenant_id={tenant_id} job_id={job_id} record_id={record_id} invoice_no={invoice_no} queue_name={queue_name} worker_id={worker_id} worker_pid={worker_pid} hostname={hostname} retry_count={retry_count}")
                await self._quarantine_poison_document(task, "REPLAY_STORM_CEILING_EXCEEDED")
                if handle:
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, lambda: queue_service.delete(handle, queue_type=self.queue_type))
                    logger.info(f"[QUEUE_MESSAGE_DELETE] id={msg_id} queue={queue_name}")
                return

            async with self.semaphore:
                # Task Type Routing (Phase 11 Hardening)
                if self.allowed_task_types and task_type not in self.allowed_task_types:
                    logger.warning(f"[CROSS_ROLE_RECEIVE] worker={self.role} received={task_type} expected={self.allowed_task_types} queue={self.queue_type}")
                    if handle:
                        logger.info(f"[SQS_YIELD_BACK] id={task_id} role={self.role} task_type={task_type} count={receive_count}")
                        queue_service.change_visibility(handle, 0, queue_type=self.queue_type)
                        logger.info(f"[WORKER_VISIBILITY_RECYCLE] id={task_id} queue={queue_name}")
                    return

                logger.info(f"[SQS_MESSAGE_DISPATCH] id={task_id} role={self.role} task_type={task_type} correlation_id={correlation_id}")
                logger.info(f"[WORKER_PICKUP] role='{self.role}' task_id='{task_id}' session_id='{session_id}' job_id='{job_id}' correlation_id='{correlation_id}'")
                logger.info(f"[CLUSTER_NODE] hostname='{hostname}' pid={worker_pid} role='{self.role}'")
                observability.trace("STAGE", role=self.role, task_id=task_id, correlation_id=correlation_id)
            
            # CHAOS: Simulated Latency
            if self.chaos_mode and self.chaos_latency_ms > 0:
                logger.warning(f"[CHAOS_LATENCY] Injecting {self.chaos_latency_ms}ms...")
                await asyncio.sleep(self.chaos_latency_ms / 1000)

            # [PHASE 11.9] REMOVED: Redis-based deduplication was too aggressive and caused data loss on worker cancellation.
            # Pipelines are inherently idempotent via DB update_or_create and Redis SADD.

            async with SqsLeaseExtender(handle, self.queue_type, interval=LEASE_EXTENSION_INTERVAL):
                try:
                    # CHAOS: Simulated Crash
                    import random
                    if self.chaos_mode and random.random() < self.chaos_crash_rate:
                        logger.critical(f"[WORKER_CRASH_SIMULATED] role={self.role} id={task_id}")
                        os._exit(1) # Hard exit to simulate crash

                    logger.info(f"[QUEUE_MESSAGE_PROCESSING] correlation_id={correlation_id} session_id={session_id} worker_name={self.role}")
                    logger.info(f"[PIPELINE_STAGE_ENTER] stage={self.role.upper()} correlation_id={correlation_id} upload_session_id={session_id} tenant_id={tenant_id} job_id={job_id} record_id={record_id} invoice_no={invoice_no}")

                    # [DB_STABILITY_FIX] Release stale DB connections before task execution (Phase 3)
                    from django.db import close_old_connections
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, close_old_connections)

                    try:
                        await self.handle_task(task)
                    finally:
                        # [DB_STABILITY_FIX] Release DB connections inside finally blocks (Phase 3)
                        await loop.run_in_executor(None, close_old_connections)
                    
                    duration_ms = int((time.time() - t_start) * 1000)
                    metrics.record_latency("worker:task_duration", time.time() - t_start, tags={"role": self.role})
                    metrics.increment_counter("worker:task_complete_total", tags={"role": self.role})
                    observability.worker_metric(event="TASK_COMPLETE", role=self.role, duration=time.time() - t_start, id=task_id, correlation_id=correlation_id)
                    
                    logger.info(f"[PIPELINE_STAGE_EXIT] stage={self.role.upper()} correlation_id={correlation_id} upload_session_id={session_id} tenant_id={tenant_id} job_id={job_id} record_id={record_id} invoice_no={invoice_no}")
                    logger.info(f"[WORKER_STAGE_SUCCESS] correlation_id={correlation_id} upload_session_id={session_id} tenant_id={tenant_id} job_id={job_id} record_id={record_id} invoice_no={invoice_no} queue_name={queue_name} worker_id={worker_id} worker_pid={worker_pid} hostname={hostname} retry_count={retry_count} visibility_timeout={visibility_timeout} processing_duration_ms={duration_ms} dto_status=COMPLETED")

                    # Success cleanup (SHIELDED)
                    if handle:
                        loop = asyncio.get_running_loop()
                        await asyncio.shield(loop.run_in_executor(None, lambda: queue_service.delete(handle, queue_type=self.queue_type)))
                        logger.info(f"[SQS_MESSAGE_DELETED] id={msg_id}")
                        logger.info(f"[QUEUE_MESSAGE_DELETE] id={msg_id} queue={queue_name}")
                        logger.info(f"[QUEUE_MESSAGE_ACK] id={task_id} queue={queue_name} correlation_id={correlation_id} session_id={session_id}")
                        logger.info(f"[MESSAGE_ACK] id={task_id} queue={queue_name} correlation_id={correlation_id}")
                        logger.info(f"[AI_TASK_ACK] id={task_id} role={self.role}")
                        logger.info(f"[VISIBILITY_SAFE] id={task_id}")
                except asyncio.CancelledError:
                    logger.warning(f"[TASK_CANCELLED] role={self.role} id={msg_id} - message will return to queue.")
                    logger.info(f"[WORKER_TIMEOUT] correlation_id={correlation_id} upload_session_id={session_id} tenant_id={tenant_id} job_id={job_id} record_id={record_id} invoice_no={invoice_no} queue_name={queue_name} worker_id={worker_id}")
                    if handle:
                        try:
                            loop = asyncio.get_running_loop()
                            await loop.run_in_executor(None, lambda: queue_service.change_visibility(handle, 0, queue_type=self.queue_type))
                            logger.info(f"[MESSAGE_NACK] id={task_id} queue={queue_name} reason=CANCELLED")
                        except Exception as ce:
                            logger.error(f"[NACK_ERR] {ce}")
                    # Re-raise to let the event loop handle it
                    raise
                except Exception as e:
                    # [DB_STABILITY_FIX] Release DB connections on exception (Phase 3)
                    from django.db import close_old_connections
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, close_old_connections)

                    duration_ms = int((time.time() - t_start) * 1000)
                    exc_class = e.__class__.__name__
                    logger.error(f"[TASK_ERR] role={self.role} id={msg_id} error={e} correlation_id={correlation_id}")
                    observability.error(event="TASK_FAILURE", role=self.role, error=str(e), id=task_id, correlation_id=correlation_id)
                    metrics.increment_counter("worker:task_failure_total", tags={"role": self.role})
                    
                    logger.error(f"[WORKER_STAGE_FAILURE] correlation_id={correlation_id} upload_session_id={session_id} tenant_id={tenant_id} job_id={job_id} record_id={record_id} invoice_no={invoice_no} queue_name={queue_name} worker_id={worker_id} worker_pid={worker_pid} hostname={hostname} retry_count={retry_count} visibility_timeout={visibility_timeout} processing_duration_ms={duration_ms} dto_status=FAILED exception_class={exc_class} exception_message='{str(e)}'")

                    # [PHASE 4: STRICT ACK & TERMINAL ERROR ROUTING]
                    if exc_class == 'TerminalTaskError':
                        logger.error(f"[TERMINAL_FAILURE_DETECTED] id={task_id} queue={queue_name} error='{str(e)}' - Routing direct to DLQ (No Retries).")
                        await self._quarantine_poison_document(task, f"TERMINAL_ERROR: {str(e)}")
                        if handle:
                            loop = asyncio.get_running_loop()
                            await asyncio.shield(loop.run_in_executor(None, lambda: queue_service.delete(handle, queue_type=self.queue_type)))
                            logger.info(f"[QUEUE_MESSAGE_DELETE] id={msg_id} queue={queue_name}")
                            logger.info(f"[MESSAGE_ACK] id={task_id} queue={queue_name} (Terminal Failure)")
                        return
                    # [PHASE 5: POISON DOCUMENT FORENSICS]
                    # Logic to move to PoisonDocument model if retry count exceeded
                    receive_count = int(task.get('_sqs_receive_count', 1))
                    logger.info(f"[QUEUE_MESSAGE_RETRY] correlation_id={correlation_id} retry_count={receive_count}")
                    if receive_count >= 3:
                        logger.info(f"[WORKER_RETRY] correlation_id={correlation_id} upload_session_id={session_id} retry_count={receive_count} - Threshold reached. Quarantining.")
                        await self._quarantine_poison_document(task, str(e))
                        if handle:
                            loop = asyncio.get_running_loop()
                            await asyncio.shield(loop.run_in_executor(None, lambda: queue_service.delete(handle, queue_type=self.queue_type)))
                            logger.info(f"[QUEUE_MESSAGE_DELETE] id={msg_id} queue={queue_name}")
                            logger.info(f"[MESSAGE_ACK] id={task_id} queue={queue_name} correlation_id={correlation_id} (Quarantined)")
                    else:
                        logger.info(f"[WORKER_RETRY] correlation_id={correlation_id} upload_session_id={session_id} retry_count={receive_count} - Will retry.")
                        if handle:
                            try:
                                backoff_seconds = min(900, (2 ** receive_count) * 10) # 20s, 40s, 80s... max 15m
                                loop = asyncio.get_running_loop()
                                await loop.run_in_executor(None, lambda: queue_service.change_visibility(handle, backoff_seconds, queue_type=self.queue_type))
                                logger.info(f"[MESSAGE_NACK] id={task_id} queue={queue_name} reason=FAILED backoff={backoff_seconds}s")
                            except Exception as ce:
                                logger.error(f"[NACK_ERR] {ce}")
        except Exception as e:
            # [DB_STABILITY_FIX] Release DB connections on outer exception (Phase 3)
            from django.db import close_old_connections
            loop = asyncio.get_running_loop()
            try:
                await loop.run_in_executor(None, close_old_connections)
            except Exception:
                pass

            duration_ms = int((time.time() - t_start) * 1000)
            exc_class = e.__class__.__name__
            logger.critical(f"[AI_TASK_LOST] msg_id={msg_id} error={e}")
            logger.critical(f"[WORKER_UNHANDLED_EXCEPTION] correlation_id={correlation_id} upload_session_id={session_id} queue_name={queue_name} exception_class={exc_class} exception_message='{str(e)}'")
            if handle:
                try:
                    # Exponential backoff for unhandled exceptions too
                    receive_count = int(raw_task.get('_sqs_receive_count', 1))
                    backoff_seconds = min(900, (2 ** receive_count) * 10)
                    queue_service.change_visibility(handle, backoff_seconds, queue_type=self.queue_type)
                    logger.info(f"[MESSAGE_NACK] id={msg_id} queue={queue_name} reason=UNHANDLED_EXCEPTION backoff={backoff_seconds}s")
                    logger.info(f"[WORKER_VISIBILITY_RECYCLE] msg_id={msg_id} queue={queue_name}")
                except Exception as ce:
                    logger.error(f"[VISIBILITY_RECYCLE_FAIL] {ce}")
            raise

    async def _quarantine_poison_document(self, task: Dict[str, Any], error_msg: str):
        """[POISON_DOCUMENT] - Captures failures for forensic analysis."""
        from ocr_pipeline.models import PoisonDocument
        loop = asyncio.get_running_loop()
        
        # Robust field resolution for both raw and normalized tasks
        corr_id = task.get('correlation_id')
        session_id = task.get('session_id') or task.get('upload_session_id')
        record_id = task.get('record_id')
        if not record_id and 'payload' in task:
            record_id = task['payload'].get('record_id')

        try:
            await loop.run_in_executor(None, lambda: PoisonDocument.objects.create(
                correlation_id=corr_id,
                session_id=session_id,
                record_id=record_id,
                worker_role=self.role,
                queue_name=self.queue_type,
                payload=task,
                error_trace=error_msg,
                retry_count=int(task.get('_sqs_receive_count', task.get('retry_count', 0)))
            ))
            logger.error(f"[INVALID_MESSAGE_QUARANTINED] id={task.get('id')} role={self.role} error={error_msg}")
        except Exception as e:
            logger.error(f"[QUARANTINE_FAILED] {e}")

