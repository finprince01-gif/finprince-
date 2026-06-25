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
LEASE_EXTENSION_INTERVAL = int(os.getenv('SQS_LEASE_EXTEND_INTERVAL', '10'))

class SqsLeaseExtender:
    def __init__(self, handle: str, queue_type: str, interval: int = 10, max_duration: int = 3600):
        self.handle = handle
        self.queue_type = queue_type
        # Force interval to be at most 10 seconds to guarantee we run well before the 30s SQS visibility timeout.
        self.interval = min(interval, 10)
        self.max_duration = max_duration
        self.start_time = time.time()
        self.running = True
        self._task = None

    async def __aenter__(self):
        if self.handle:
            logger.info(f"[VISIBILITY_EXTENDER_START] role={self.queue_type} handle={self.handle[:10]}...")
            logger.debug(f"[SQS_VISIBILITY_START] handle={self.handle[:10]}... queue={self.queue_type}")
            
            # Immediately extend visibility to 1800s to cover the first interval safely
            loop = asyncio.get_running_loop()
            try:
                extended = await loop.run_in_executor(
                    None,
                    lambda: queue_service.change_visibility(
                        self.handle,
                        timeout=1800,
                        queue_type=self.queue_type
                    )
                )
                if not extended:
                    logger.critical(f"[LEASE_EXTEND_FAILURE] Initial visibility change failed for role={self.queue_type}")
                    metrics.increment_counter("sqs:lease_extension_failures", tags={"role": self.queue_type, "stage": "initial"})
            except Exception as e:
                logger.error(f"[LEASE_EXTEND_INITIAL_ERR] role={self.queue_type} error={e}")
                metrics.increment_counter("sqs:lease_extension_failures", tags={"role": self.queue_type, "stage": "initial"})
            
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
        if self.handle:
            logger.info(f"[VISIBILITY_EXTENDER_STOP] role={self.queue_type} handle={self.handle[:10]}...")

    async def _extend_loop(self):
        while self.running:
            try:
                await asyncio.sleep(self.interval)
                
                if time.time() - self.start_time > self.max_duration:
                    logger.critical(f"[STUCK_MESSAGE_DETECTED] role={self.queue_type} handle={self.handle[:10]}... releasing visibility")
                    loop = asyncio.get_running_loop()
                    await asyncio.shield(loop.run_in_executor(
                        None,
                        lambda: queue_service.change_visibility(self.handle, 0, queue_type=self.queue_type)
                    ))
                    self.running = False
                    break

                if self.running:
                    loop = asyncio.get_running_loop()
                    logger.info(f"[QUEUE_VISIBILITY_TIMEOUT] Extending visibility for message handle={self.handle[:10]} queue={self.queue_type}")
                    logger.info(f"[VISIBILITY_TIMEOUT_EXTENDED] Extending visibility for message handle={self.handle[:10]} queue={self.queue_type}")
                    extended = await asyncio.shield(loop.run_in_executor(
                        None,
                        lambda: queue_service.change_visibility(
                            self.handle,
                            timeout=1800,
                            queue_type=self.queue_type
                        )
                    ))
                    if not extended:
                        logger.critical(f"[LEASE_EXTEND_FAILURE] Periodic visibility change failed for role={self.queue_type}")
                        metrics.increment_counter("sqs:lease_extension_failures", tags={"role": self.queue_type, "stage": "periodic"})
            except asyncio.CancelledError:
                logger.info(f"[VISIBILITY_EXTENDER_CANCEL] role={self.queue_type}")
                break
            except Exception as e:
                logger.error(f"[LEASE_EXTEND_ERR] role={self.queue_type} error={e}")
                metrics.increment_counter("sqs:lease_extension_failures", tags={"role": self.queue_type, "stage": "loop_exception"})
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
        self._was_idle = False
        
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

    async def _resource_monitor(self):
        """
        [WORKER_RESOURCE] - Background telemetry & Large PDF Governance.
        Monitors worker RSS memory and initiates a safe recycle if limits are breached,
        and logs database connection diagnostics.
        """
        import psutil
        import os
        import signal
        
        logger.info(f"[RESOURCE_MONITOR_START] role={self.role}")
        logger.info(f"[MEMORY_GOVERNANCE_ACTIVE] role={self.role}")
        
        process = psutil.Process(os.getpid())
        MAX_RSS_MB = 600.0  # Safe threshold before OOM
        SUSTAINED_SECONDS = 60
        
        sustained_count = 0
        last_db_check = 0.0
        last_heartbeat_log = 0.0
        
        while self.running:
            try:
                # Dynamic check interval config (Phase 7)
                try:
                    check_interval = int(os.getenv('WORKER_RESOURCE_INTERVAL_SECONDS', '15'))
                except (ValueError, TypeError):
                    check_interval = 15
                
                await asyncio.sleep(check_interval)
                if not self.running:
                    break
                
                current_time = time.time()
                
                # A. Basic health heartbeat metrics
                metrics.increment_counter("worker:heartbeat_total", tags={"role": self.role})
                
                # B. CPU & RSS Memory Telemetry
                rss_bytes = process.memory_info().rss
                rss_mb = rss_bytes / (1024 * 1024)
                cpu = process.cpu_percent(interval=None)
                
                # Telemetry log
                logger.debug(f"[WORKER_RESOURCE] role={self.role} cpu={cpu} rss_mb={rss_mb:.2f} active={len(self.active_tasks)}")
                
                # Metrics
                metrics.set_gauge("worker:cpu", cpu, tags={"role": self.role})
                metrics.set_gauge("worker:rss", rss_mb, tags={"role": self.role})
                metrics.set_gauge("worker:active_tasks", len(self.active_tasks), tags={"role": self.role})
                
                # C. Heartbeat Logging (every 60 seconds)
                if current_time - last_heartbeat_log >= 60:
                    last_heartbeat_log = current_time
                    logger.info(f"[RESOURCE_MONITOR_HEARTBEAT] role={self.role}")
                
                # D. Large PDF Governance Memory Threshold Check & Force Recycle (Phase 3)
                force_recycle = os.getenv('FORCE_WORKER_RECYCLE', 'false').lower() == 'true' or os.getenv('WORKER_TEST_RECYCLE', 'false').lower() == 'true'
                threshold_hits_required = max(1, SUSTAINED_SECONDS // check_interval)
                
                if rss_mb > MAX_RSS_MB or force_recycle:
                    sustained_count += 1
                    if force_recycle:
                        logger.warning(f"[WORKER_SUSTAINED_MEMORY_PRESSURE] role={self.role} rss_mb={rss_mb:.2f} limit={MAX_RSS_MB} (FORCED RECYCLE)")
                    else:
                        logger.warning(f"[WORKER_SUSTAINED_MEMORY_PRESSURE] role={self.role} rss_mb={rss_mb:.2f} limit={MAX_RSS_MB} sustained={sustained_count}/{threshold_hits_required}")
                    
                    if sustained_count >= threshold_hits_required or force_recycle:
                        logger.critical(f"[WORKER_RECYCLE_TRIGGERED] role={self.role} rss_mb={rss_mb:.2f} limit={MAX_RSS_MB}. Initiating graceful exit.")
                        logger.info(f"[WORKER_RECYCLE_STARTED] role={self.role} active_tasks={len(self.active_tasks)}")
                        
                        self.running = False
                        if self.active_tasks:
                            logger.info(f"[WORKER_GRACEFUL_DRAIN] Waiting for {len(self.active_tasks)} active tasks to finish before exit...")
                            await asyncio.gather(*self.active_tasks.values(), return_exceptions=True)
                        
                        logger.info(f"[WORKER_RECYCLE_COMPLETED] role={self.role} pid={os.getpid()}")
                        self.shutdown(signum=signal.SIGTERM, frame=None)
                        break
                else:
                    if sustained_count > 0:
                        logger.info(f"[WORKER_RECYCLE_ABORTED] role={self.role} RSS recovered to {rss_mb:.2f}MB")
                    sustained_count = 0

                # E. [DB_CONNECTION_FORENSICS] SHOW PROCESSLIST check (Phase 8 - throttled to 60s)
                if current_time - last_db_check >= 60:
                    last_db_check = current_time
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
                        loop_current = asyncio.get_running_loop()
                        await loop_current.run_in_executor(None, close_old_connections)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[RESOURCE_MONITOR_ERROR] {e}")


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

        # [PHASE 11.9] SINGLETON WORKER LOCK
        import redis
        cluster_env = os.getenv('CLUSTER_ENV', 'local')
        # [FIX] Use same DB as redis_orchestrator so heartbeats are visible to terminalization check.
        redis_db = int(os.getenv('REDIS_DB', '0'))
        redis_url = f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}/{redis_db}"
        try:
            r = redis.Redis.from_url(redis_url, decode_responses=True)
            self._lock_key = f"worker_lock_{self.role}_{cluster_env}"
            self._heartbeat_key = f"worker_hb_{self.role}_{cluster_env}"

            # [PHASE 2: DETERMINISTIC OWNERSHIP RECONCILIATION]
            # Workers MUST NOT immediately self-terminate on ROLE_ALREADY_OWNED.
            # Instead, validate: owner PID exists, process alive, heartbeat freshness.
            import psutil
            
            # Initial attempt to acquire
            acquired = r.set(self._lock_key, str(os.getpid()), nx=True, ex=90)
            
            if not acquired:
                current_owner = r.get(self._lock_key)
                ttl = r.ttl(self._lock_key)
                logger.critical(f"[ROLE_ALREADY_OWNED] role={self.role} pid={os.getpid()} lock_key={self._lock_key} owner_pid={current_owner} ttl={ttl}s")
                
                can_reclaim = False
                reclaim_reason = ""
                
                if current_owner:
                    logger.info(f"[WORKER_PID_VALIDATION] Validating owner_pid={current_owner}")
                    try:
                        owner_pid = int(current_owner)
                        # Check if process is actually alive
                        if not psutil.pid_exists(owner_pid):
                            can_reclaim = True
                            reclaim_reason = "OWNER_PID_DEAD"
                        else:
                            # Process exists, check heartbeat freshness
                            last_hb = r.hget("worker_heartbeats", f"{self.role}_{cluster_env}")
                            if last_hb:
                                hb_age = time.time() - float(last_hb)
                                if hb_age > 90:
                                    can_reclaim = True
                                    reclaim_reason = "HEARTBEAT_EXPIRED"
                                    logger.warning(f"[WORKER_HEARTBEAT_EXPIRED] owner_pid={current_owner} hb_age={hb_age}s")
                            else:
                                can_reclaim = True
                                reclaim_reason = "NO_HEARTBEAT_FOUND"
                    except ValueError:
                        can_reclaim = True
                        reclaim_reason = "INVALID_PID_FORMAT"
                else:
                     can_reclaim = True
                     reclaim_reason = "NO_OWNER_DATA"
                     
                if ttl <= 0 or ttl == -1:
                    can_reclaim = True
                    reclaim_reason = "STALE_LOCK_NO_TTL"
                    logger.warning(f"[WORKER_LOCK_STALE_DETECTED] role={self.role} lock has no TTL ({ttl}).")

                if can_reclaim:
                    logger.warning(f"[LOCK_RECLAIM_INITIATED] role={self.role} reason={reclaim_reason} force-clearing stale lock.")
                    r.delete(self._lock_key)
                    acquired = r.set(self._lock_key, str(os.getpid()), nx=True, ex=90)
                    
                if not acquired:
                    logger.critical(f"[WATCHDOG_RESTART_REASON] role={self.role} — lock owner={current_owner} still active. Exiting to prevent split-brain.")
                    return

            logger.info(f"[WORKER_LOCK_ACQUIRE] role={self.role} pid={os.getpid()} key={self._lock_key}")
            logger.info(f"[WORKER_SINGLETON_ACQUIRED] role={self.role} pid={os.getpid()}")

            # [FIX] Write a per-role heartbeat key WITH TTL so dead workers auto-expire.
            # The legacy 'worker_heartbeats' hash has no per-field TTL so stale entries
            # persist after crashes and block the orchestrator's terminalization check.
            r.set(self._heartbeat_key, str(os.getpid()), ex=90)
            r.hset("worker_heartbeats", f"{self.role}_{cluster_env}", time.time())
            logger.info(f"[WORKER_HEARTBEAT_WRITE] role={self.role} initial heartbeat created")

            # Keep renewing lock and heartbeat in background
            async def renew_lock():
                while self.running:
                    await asyncio.sleep(10)
                    if self.running:
                        try:
                            r.expire(self._lock_key, 90)
                            r.expire(self._heartbeat_key, 90)
                            r.hset("worker_heartbeats", f"{self.role}_{cluster_env}", time.time())
                            if not self._was_idle:
                                logger.debug(f"[WORKER_LOCK_REFRESH] role={self.role} pid={os.getpid()}")
                        except Exception as e:
                            logger.error(f"[LOCK_RENEW_ERROR] {e}")

            self._lock_task = asyncio.create_task(renew_lock())

        except Exception as e:
            logger.error(f"[WORKER_LOCK_ERROR] {e}")
            pass
        
        # Start resource monitor
        if hasattr(self, '_resource_monitor'):
            self._monitor_task = asyncio.create_task(self._resource_monitor())
        
        logger.info(f"[POLL_LOOP_ENTER] role={self.role}")
        logger.info(f"[WORKER_LOOP_STARTED] role={self.role}")
        
        while self.running:
            if not self._was_idle:
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
                        wait_time=20,
                        suppress_empty_log=self._was_idle
                    )
                )

                # [PHASE 1] Update actual polling timestamp
                try:
                    import redis
                    redis_db = int(os.getenv('REDIS_DB', '0'))
                    redis_url = f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}/{redis_db}"
                    r_poll = redis.Redis.from_url(redis_url, decode_responses=True)
                    r_poll.hset("worker_polling_activity", f"{self.role}_{cluster_env}", time.time())
                except Exception as e:
                    logger.error(f"[POLL_TIMESTAMP_ERR] {e}")

                if not messages:
                    if not self._was_idle:
                        logger.info(f"[WORKER_IDLE_STATE_ENTERED] role={self.role} queue={self.queue_type}")
                        logger.info(f"[WORKER_IDLE_WAIT] role={self.role} queue={self.queue_type} status=EMPTY")
                        logger.info(f"[POLL_EMPTY_TICK] role={self.role} active={len(self.active_tasks)} running={self.running}")
                        self._was_idle = True
                else:
                    if self._was_idle:
                        self._was_idle = False
                        logger.info(f"[WORKER_IDLE_STATE_EXITED] role={self.role} queue={self.queue_type}")
                    for msg in messages:
                        msg_id = msg.get('_sqs_message_id', 'unknown')
                        task_id = msg.get('id', 'unknown')
                        logger.info(f"[WORKER_MESSAGE_RECEIVED] role={self.role} id={task_id} msg_id={msg_id}")
                        receive_count = msg.get('_sqs_receive_count', 1)
                        
                        if int(receive_count) > 1:
                            logger.warning(f"[MESSAGE_REPLAY] id={msg.get('id')} receive_count={receive_count}")
                            logger.info(f"[WORKER_RECOVERED] role={self.role} id={msg.get('id')}")

                        logger.info(f"[EXECUTOR_SUBMIT] id={msg.get('id', 'unknown')} msg_id={msg_id}")
                        
                        # [PHASE 1] Record consume start timestamp
                        try:
                            r_poll.hset("worker_processing_activity", f"{self.role}_{cluster_env}", time.time())
                        except: pass
                        
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
                        
                if not self._was_idle:
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
            
        # Cleanup singleton lock
        try:
            if hasattr(self, '_lock_task'):
                self._lock_task.cancel()
            import redis
            redis_db = int(os.getenv('REDIS_DB', '0'))
            r = redis.Redis.from_url(f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}/{redis_db}",
                                     decode_responses=True)
            if hasattr(self, '_lock_key'):
                current_owner = r.get(self._lock_key)
                if current_owner and current_owner == str(os.getpid()):
                    r.delete(self._lock_key)
                    logger.info(f"[LOCK_RELEASE] role={self.role} pid={os.getpid()} key={self._lock_key}")
                    logger.info(f"[WORKER_SINGLETON_RELEASED] role={self.role} pid={os.getpid()}")
            if hasattr(self, '_heartbeat_key'):
                r.delete(self._heartbeat_key)
                cluster_env = os.getenv('CLUSTER_ENV', 'local')
                r.hdel("worker_heartbeats", f"{self.role}_{cluster_env}")
                logger.info(f"[LOCK_EXPIRED] role={self.role} heartbeat key cleared")
        except Exception as e:
            logger.error(f"[LOCK_CLEANUP_ERROR] {e}")

        logger.info(f"[WORKER_FINAL_EXIT] role={self.role}")



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
        visibility_timeout = 1800
        
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

            # [PHASE 11.9] OWNERSHIP VALIDATION
            ownership = raw_task.get('_ownership', {})
            msg_cluster_env = ownership.get('cluster_env')
            if msg_cluster_env and msg_cluster_env != os.getenv('CLUSTER_ENV', 'local'):
                logger.critical(f"[FOREIGN_MESSAGE_REJECTED] id={msg_id} msg_env={msg_cluster_env} local_env={os.getenv('CLUSTER_ENV', 'local')}")
                if handle:
                    # Do not delete, let it return to queue for the correct consumer
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, lambda: queue_service.change_visibility(handle, 0, queue_type=self.queue_type))
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

            if receive_count >= 10:
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
                        
                        # Use global coordinator to check and trigger assembly if appropriate
                        from vouchers.coordinator import check_and_trigger_assembly, log_forensic_trace
                        log_forensic_trace("check_and_trigger_assembly_worker_base_BEFORE", record_id)
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(
                            None,
                            lambda: check_and_trigger_assembly(
                                record_id=record_id,
                                tenant_id=tenant_id,
                                session_id=session_id,
                                correlation_id=correlation_id,
                                job_id=job_id,
                                item_id=task.get('item_id')
                            )
                        )
                        log_forensic_trace("check_and_trigger_assembly_worker_base_AFTER", record_id)
                            
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
                        
                    if exc_class == 'ProviderSaturatedError':
                        sat_retries = int(raw_task.get('_saturated_retry_count', 0))
                        logger.warning(
                            f"[PROVIDER_SATURATED] id={task_id} queue={queue_name} "
                            f"sat_retries={sat_retries} - Backing off."
                        )
                        
                        if sat_retries >= 10:
                            logger.error(
                                f"[PROVIDER_SATURATED_LIMIT_EXCEEDED] id={task_id} record={record_id} "
                                f"Reached maximum saturation retries ({sat_retries}). Marking as failed."
                            )
                            # Treat as terminal failure to unblock barrier
                            await self._quarantine_poison_document(raw_task, f"ProviderSaturatedError retry exhaustion limit: {sat_retries}")
                            if record_id and record_id != 'unknown':
                                if self.role == "AI":
                                    page_num = task.get('page_number') or task.get('payload', {}).get('page_index') or task.get('payload', {}).get('page_number') or 1
                                    def _write_terminal_fail():
                                        from vouchers.coordinator import terminalize_page_state
                                        terminalize_page_state(
                                            record_id=str(record_id),
                                            page_number=page_num,
                                            session_id=session_id,
                                            is_failed=True,
                                            canonical_payload={'status': 'OCR_FAILED', 'error': f'PROVIDER_SATURATED_LIMIT_EXCEEDED: sat_retries={sat_retries}'},
                                            worker_id=self.role,
                                            queue_source=self.queue_type,
                                            tenant_id=tenant_id,
                                            correlation_id=correlation_id,
                                            job_id=job_id,
                                            item_id=task.get('item_id'),
                                        )
                                    loop = asyncio.get_running_loop()
                                    await loop.run_in_executor(None, _write_terminal_fail)
                            
                            if handle:
                                loop = asyncio.get_running_loop()
                                await asyncio.shield(loop.run_in_executor(None, lambda: queue_service.delete(handle, queue_type=self.queue_type)))
                                logger.info(f"[QUEUE_MESSAGE_DELETE] id={msg_id} queue={queue_name}")
                            return

                        # Calculate exponential backoff based on saturation retry count
                        backoff_seconds = min(900, (2 ** sat_retries) * 20)
                        
                        # Increment saturation count in payload
                        new_task = dict(raw_task)
                        new_task['_saturated_retry_count'] = sat_retries + 1
                        new_task['id'] = str(uuid.uuid4())  # Generate a new unique Message Instance ID
                        
                        # Strip SQS metadata from enqueued payload
                        new_task.pop('_sqs_handle', None)
                        new_task.pop('_sqs_message_id', None)
                        new_task.pop('_sqs_receive_count', None)
                        
                        # Re-enqueue copy as delayed message to reset SQS native ReceiveCount
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(
                            None,
                            lambda: queue_service.push(
                                message=new_task,
                                queue_type=self.queue_type,
                                delay_seconds=backoff_seconds
                            )
                        )
                        logger.info(f"[MESSAGE_REQUEUED_DELAYED] id={task_id} queue={queue_name} delay={backoff_seconds}s next_sat_retry={sat_retries + 1}")
                        
                        # Delete the old message from queue (ACK)
                        if handle:
                            await asyncio.shield(loop.run_in_executor(None, lambda: queue_service.delete(handle, queue_type=self.queue_type)))
                            logger.info(f"[QUEUE_MESSAGE_DELETE] id={msg_id} queue={queue_name}")
                        return
                    # [PHASE 5: POISON DOCUMENT FORENSICS]
                    # Logic to move to PoisonDocument model if retry count exceeded
                    receive_count = int(task.get('_sqs_receive_count', 1))
                    logger.info(f"[QUEUE_MESSAGE_RETRY] correlation_id={correlation_id} retry_count={receive_count}")
                    if receive_count >= 10:
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
            logger.error(f"[DLQ_MESSAGE_ROUTED] id={task.get('id')} queue={self.queue_type} correlation_id={corr_id}")
        except Exception as e:
            logger.error(f"[QUARANTINE_FAILED] {e}")

