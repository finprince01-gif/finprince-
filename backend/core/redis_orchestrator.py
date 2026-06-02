import redis
import os
import logging
import json
import time
from typing import Optional, List, Set

logger = logging.getLogger(__name__)

# Redis Connection Configuration
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_DB = int(os.getenv('REDIS_DB', '0'))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None)

class RedisOrchestrator:
    """
    Hyperscale Redis Orchestration Layer.
    Handles distributed synchronization, barriers, and deduplication.
    """
    def __init__(self):
        self.redis = None
        self._lua_acquire_sha = None
        self.acquire_slot_script = """
        local record_key = KEYS[1]
        local tenant_key = KEYS[2]
        
        local record_id = ARGV[1]
        local page_number = ARGV[2]
        local permit_id = ARGV[3]
        local current_time = tonumber(ARGV[4])
        local expiration_time = tonumber(ARGV[5])
        local max_record_window = tonumber(ARGV[6])
        local max_tenant_window = tonumber(ARGV[7])
        
        -- Cleanup expired
        redis.call('ZREMRANGEBYSCORE', record_key, 0, current_time)
        if tenant_key ~= "" then
            redis.call('ZREMRANGEBYSCORE', tenant_key, 0, current_time)
        end
        
        -- Check limits
        local record_count = redis.call('ZCARD', record_key)
        if record_count >= max_record_window then
            return 0
        end
        
        if tenant_key ~= "" then
            local tenant_count = redis.call('ZCARD', tenant_key)
            if tenant_count >= max_tenant_window then
                return -1
            end
        end
        
        -- Acquire
        redis.call('ZADD', record_key, expiration_time, page_number)
        if tenant_key ~= "" then
            redis.call('ZADD', tenant_key, expiration_time, permit_id)
        end
        
        return 1
        """
        self._connect()

    def _connect(self):
        try:
            self.redis = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                password=REDIS_PASSWORD,
                decode_responses=True,
                socket_timeout=5,
                retry_on_timeout=True
            )
            self.redis.ping()
            logger.info(f"[REDIS_INIT] Connected to {REDIS_HOST}:{REDIS_PORT}")
        except Exception as e:
            logger.error(f"[REDIS_CRITICAL] Failed to connect: {e}")
            self.redis = None

    def _safe_exec(self, func, *args, **kwargs):
        """Wrapper for resilient Redis operations."""
        if not self.redis:
            self._connect()
            if not self.redis:
                logger.error("[REDIS_DISCONNECTED] Operation aborted.")
                return None
        
        from core.observability import observability, metrics
        t_start = time.time()
        try:
            result = func(*args, **kwargs)
            latency = (time.time() - t_start) * 1000 # ms
            metrics.record_latency("redis:op_duration", latency, tags={"op": func.__name__})
            return result
        except (redis.ConnectionError, redis.TimeoutError):
            logger.warning("[REDIS_DISCONNECTED] Connection lost. Attempting recovery...")
            self._connect()
            if self.redis:
                logger.info("[REDIS_RECOVERED] Connection restored.")
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    logger.error(f"[REDIS_RECOVERY_FAIL] {e}")
            return None
        except Exception as e:
            logger.error(f"[REDIS_OP_ERR] {e}")
            return None

    # ── STEP 3A: REDIS PAGE BARRIER ──
    def register_page_completion(self, record_id: str, page_number: int, is_failed: bool = False):
        """
        Atomic registration of page completion in Redis barrier.
        [PHASE 11.9] Hardened with Distributed Locking and Cross-Set Duplicate Prevention.
        """
        from core.observability import observability, metrics
        t_start = time.time()

        try:
            # Route legacy register through the new single-state system
            state = "FAILED" if is_failed else "SUCCESS"
            self.set_page_state(record_id, page_number, state, reason="legacy_register")
        except Exception as e:
            logger.error(f"[BARRIER_SYNC_ERROR] record={record_id} error={e}")
            raise

        latency = (time.time() - t_start) * 1000
        observability.redis_metric(event="BARRIER_UPDATE", record_id=record_id, latency_ms=latency)
        metrics.record_latency("redis:barrier_latency", latency)
        return True

    def set_page_state(self, record_id: str, page_number: int, new_state: str, reason: str = ""):
        """
        [PHASE 17] SINGLE AUTHORITATIVE PAGE STATE.
        Sets the strict terminal state for a page (SUCCESS, FAILED, PARTIAL, CONTINUATION).
        """
        session_key = f"assembly:{record_id}"
        states_key = f"{session_key}:page_states"
        
        # [FIX 3] Remove RECOVERED as terminal type
        if new_state == "RECOVERED":
            logger.info(f"[PAGE_RECONCILED] page={page_number} reason='{reason}' -> Mapped to SUCCESS")
            new_state = "SUCCESS"
        
        with self.redis.lock(f"lock:barrier:{record_id}", timeout=10):
            old_state = self.redis.hget(states_key, str(page_number)) or "UNKNOWN"
            
            # [FIX 5] Prevent backward transitions from terminal states
            if old_state in ["SUCCESS", "PARTIAL", "CONTINUATION"] and new_state == "FAILED":
                logger.warning(f"[BACKWARD_TRANSITION_REJECTED] record={record_id} page={page_number} attempted {old_state} -> FAILED")
                return False
                
            if old_state != new_state:
                self.redis.hset(states_key, str(page_number), new_state)
                logger.info(f"[PAGE_STATE_TRANSITION] page_no={page_number} old_state={old_state} new_state={new_state} reason='{reason}' record={record_id}")
            
            self.redis.hset(session_key, "updated_at", time.time())
            self.redis.expire(session_key, 86400)
            self.redis.expire(states_key, 86400)
            return True

    def get_barrier_state(self, record_id: str, expected_pages: int):
        """Checks if the barrier is ready (all pages accounted for) using the unified states hash."""
        session_key = f"assembly:{record_id}"
        states_key = f"{session_key}:page_states"
        
        # Pull the authoritative dictionary of page -> state
        page_states = self.redis.hgetall(states_key) or {}
            
        terminal_states = {"SUCCESS", "FAILED", "PARTIAL", "CONTINUATION"}
        terminal_pages = {p for p, s in page_states.items() if s in terminal_states}
        
        total_ready = len(terminal_pages)
        completed_count = sum(1 for s in page_states.values() if s == "SUCCESS")
        failed_count = sum(1 for s in page_states.values() if s == "FAILED")
        partial_count = sum(1 for s in page_states.values() if s == "PARTIAL")
        continuation_count = sum(1 for s in page_states.values() if s == "CONTINUATION")
        
        # [PHASE 11.9] Forensic Snapshot
        logger.info(f"[BARRIER_TERMINAL_PROGRESS] record={record_id} terminal={total_ready} expected={expected_pages} "
                    f"success={completed_count} failed={failed_count} partial={partial_count} continuation={continuation_count}")
        logger.info(f"[BARRIER_PROGRESS] record={record_id} progress={total_ready}/{expected_pages}")
        
        # Sanity Check for Corruption
        if total_ready > expected_pages:
            logger.critical(f"[BARRIER_CORRUPTION_DETECTED] record={record_id} total={total_ready} > expected={expected_pages}")
            
        is_ready = total_ready >= expected_pages
        
        state = {
            "completed": completed_count,
            "failed": failed_count,
            "total": total_ready,
            "expected": expected_pages,
            "is_ready": is_ready
        }
        
        if is_ready:
            logger.info(f"[BARRIER_READY] record={record_id} state={state}")
            logger.info(f"[BARRIER_COMPLETED] record={record_id} state={state}")
            logger.info(f"[BARRIER_COMPLETE] record={record_id}")
        else:
            logger.info(f"[BARRIER_INCOMPLETE] record={record_id} progress={total_ready}/{expected_pages}")
            updated_at_str = self.redis.hget(session_key, "updated_at")
            if updated_at_str:
                try:
                    updated_at = float(updated_at_str)
                    if time.time() - updated_at > 60:
                        received_pages = sorted([int(p) for p in terminal_pages])
                        missing_pages = [p for p in range(1, expected_pages + 1) if p not in received_pages]
                        logger.error(f"[BARRIER_TIMEOUT] record={record_id} missing_pages={missing_pages}")
                except: pass
        
        return state
                
    def get_active_slots_count(self, record_id: str) -> int:
        """Returns the number of active slots for a given record."""
        slot_key = f"assembly:{record_id}:active_slots"
        try:
            return self.redis.zcard(slot_key) or 0
        except Exception as e:
            logger.error(f"[SLOT_COUNT_ERR] record={record_id} error={e}")
            return 0

    def clean_stale_slots(self, record_id: str, session_id: str = "unknown"):
        """Watchdog: releases slots active for > 120 seconds and updates barrier."""
        slot_key = f"assembly:{record_id}:active_slots"
        try:
            now = time.time()
            cutoff = now - 120
            # Get expired pages before the Lua script drops them
            stale_pages = self.redis.zrangebyscore(slot_key, 0, cutoff)
            for page_str in stale_pages:
                try:
                    page_num = int(page_str)
                    logger.warning(f"[WINDOW_LEAK_DETECTED] record={record_id} page={page_num} exceeded 120s timeout. Watchdog cleanup triggered.")
                    
                    self.release_ai_slot(record_id, page_num, session_id=session_id, release_reason="WATCHDOG_TIMEOUT")
                    
                    # Mark page terminally failed in barrier
                    self.register_page_completion(record_id, page_num, is_failed=True)
                except Exception as inner_ex:
                    logger.error(f"[WATCHDOG_PAGE_CLEAN_ERR] page={page_str} error={inner_ex}")
        except Exception as e:
            logger.error(f"[WATCHDOG_CLEAN_ERR] record={record_id} error={e}")

    def acquire_ai_slot(self, record_id: str, page_number: int, session_id: str = "unknown", tenant_id: str = "unknown") -> bool:
        """Atomically acquires an AI slot for a page while respecting both record-level and tenant-level fair share limits."""
        slot_key = f"assembly:{record_id}:active_slots"
        lock_key = f"lock:slot:{record_id}"
        tenant_key = f"tenant_inflight:{tenant_id}"
        MAX_RECORD_WINDOW = 5
        MAX_TENANT_WINDOW = 15
        
        try:
            if not self._lua_acquire_sha:
                self._lua_acquire_sha = self.redis.script_load(self.acquire_slot_script)
                
            now = time.time()
            expiration = now + 120 # 2 minute max lease
            permit_id = f"{record_id}:{page_number}"
            
            keys = [slot_key, tenant_key if tenant_id != "unknown" else ""]
            args = [
                record_id, 
                str(page_number), 
                permit_id, 
                now, 
                expiration, 
                MAX_RECORD_WINDOW, 
                MAX_TENANT_WINDOW
            ]
            
            result = self.redis.evalsha(self._lua_acquire_sha, len(keys), *keys, *args)
            
            if result == 0:
                logger.debug(f"[FANOUT_WINDOW_STATUS] record={record_id} — slot acquisition denied (record limit)")
                return False
            elif result == -1:
                logger.warning(f"[FAIR_SHARE_THROTTLE] tenant={tenant_id} reached inflight limit. Delaying page={page_number} for record={record_id}.")
                return False
                
            new_count = self.redis.zcard(slot_key)
            logger.info(f"[SLOT_ACQUIRED] record_id={record_id} page_number={page_number} session_id={session_id} current_window_count={new_count} worker_role=AI")
            logger.info(f"[WINDOW_COUNT] record={record_id} count={new_count}")
            logger.info(f"[FANOUT_WINDOW_STATUS] record={record_id} current={new_count}")
            return True
        except Exception as e:
            logger.error(f"[SLOT_ACQUIRED_ERR] record={record_id} page={page_number} error={e}")
            return False

    def release_ai_slot(self, record_id: str, page_number: int, session_id: str = "unknown", release_reason: str = "COMPLETED", tenant_id: str = "unknown") -> bool:
        """Atomically releases an AI slot for a page."""
        slot_key = f"assembly:{record_id}:active_slots"
        lock_key = f"lock:slot:{record_id}"
        tenant_key = f"tenant_inflight:{tenant_id}"
        
        try:
            removed = self.redis.zrem(slot_key, str(page_number))
            
            if tenant_id != "unknown":
                permit_id = f"{record_id}:{page_number}"
                self.redis.zrem(tenant_key, permit_id)
                
            if removed:
                new_count = self.redis.zcard(slot_key)
                logger.info(f"[SLOT_RELEASED] record_id={record_id} page_number={page_number} session_id={session_id} current_window_count={new_count} worker_role=AI")
                logger.info(f"[SLOT_RELEASE_REASON] record={record_id} page={page_number} reason={release_reason}")
                logger.info(f"[WINDOW_COUNT] record={record_id} count={new_count}")
                logger.info(f"[FANOUT_WINDOW_STATUS] record={record_id} current={new_count}")
                return True
            else:
                logger.debug(f"[SLOT_RELEASE_SKIP] record={record_id} page={page_number} — not in active slots")
                return False
        except Exception as e:
            logger.error(f"[SLOT_RELEASE_ERR] record={record_id} page={page_number} error={e}")
            return False

    # ── STEP 3B: REDIS FINALIZATION LOCK ──
    def acquire_finalize_lock(self, record_id: str, expiry_ms: int = 30000) -> bool:
        """Acquires an idempotent lock for job finalization."""
        from core.observability import observability, metrics
        t_start = time.time()
        
        def _acquire():
            lock_key = f"lock:finalize:{record_id}"
            acquired = self.redis.set(lock_key, "locked", px=expiry_ms, nx=True)
            if acquired:
                logger.info(f"[FINALIZE_OWNER_GRANTED] record={record_id}")
            else:
                logger.warning(f"[FINALIZE_OWNER_REJECTED] record={record_id}")
            return bool(acquired)

        result = self._safe_exec(_acquire)
        latency = (time.time() - t_start) * 1000
        metrics.record_latency("redis:lock_latency", latency)
        if result:
            observability.redis_metric(event="LOCK_ACQUIRED", record_id=record_id, latency_ms=latency)
        
        return result if result is not None else True # Safety fallback

    # [PHASE 11.9] is_duplicate_task removed as it was dangerous for distributed retries.

    # ── STEP 3D: REDIS LIVE STATUS ──
    def update_session_status(self, record_id: str, status: str, progress: float = 0.0, extra_data: dict = None):
        """Updates live session status for frontend polling with monotonic enforcement."""
        def _update():
            logger.info(f"[REDIS_STATE_MUTATION_ENTER] record={record_id}")
            logger.info(f"[REDIS_STATE_MUTATION_INPUT] record={record_id} raw_input_status={status}")
            
            target_status = status.upper() if status else "UNKNOWN"
            if not status:
                logger.warning(f"[REDIS_STATUS_UNINITIALIZED] record={record_id} - falling back to UNKNOWN")
                
            logger.info(f"[REDIS_STATUS_ASSIGN] record={record_id} assigned_status={target_status}")

            status_key = f"session:{record_id}"
            
            # ── [PHASE 16: STRICT EXPLICIT STATE GRAPH] ──
            current_status = self.redis.hget(status_key, "status")
            if current_status:
                current_status = current_status.upper()

            current_progress = self.redis.hget(status_key, "progress")
            current_prog_float = 0.0
            if current_progress:
                try:
                    current_prog_float = float(current_progress)
                except ValueError:
                    pass

            effective_progress = max(progress, current_prog_float)

            # 1. State Normalization
            STATE_NORMALIZATION = {
                "PROCESSING": "AI_PROCESSING",
                "QUEUED": "INGESTION_STARTED",
                "PENDING": "INGESTION_STARTED",
                "INGESTED": "INGESTION_COMPLETE",
                "INGESTING": "INGESTION_STARTED",  # [FIX] was missing — caused BACKWARD_TRANSITION rejection
                "EXTRACTING": "AI_PROCESSING",
                "ASSEMBLING": "ASSEMBLY_PENDING",
                "DONE": "COMPLETED",
                "EXPORTED": "FINALIZING",
                "FINALIZED": "HYDRATION_READY",   # normalize pipeline FINALIZED to hydration state
                "MATERIALIZED": "HYDRATION_READY", # normalize materialize worker output
            }
            
            raw_state = target_status
            if target_status in STATE_NORMALIZATION:
                target_status = STATE_NORMALIZATION[target_status]
                logger.info(f"[LIFECYCLE_STATE_NORMALIZED] raw_state={raw_state} normalized_state={target_status} record={record_id}")
            else:
                logger.info(f"[STATE_NORMALIZED] raw_state={raw_state} normalized_state={target_status} record={record_id}")
                
            if current_status in STATE_NORMALIZATION:
                current_status = STATE_NORMALIZATION[current_status]

            # 2. Strict Allowed Transitions Graph
            # [FIX] Added INGESTING, PROCESSING, PARTIAL_FAILED, ASSEMBLY_COMPLETE
            # so that real worker state emissions are never wrongly rejected.
            ALLOWED_TRANSITIONS = {
                None: ["UPLOADED", "INGESTION_STARTED", "AI_PROCESSING", "ASSEMBLY_PENDING", "FINALIZING"],  # unknown start
                "UNKNOWN": ["UPLOADED", "INGESTION_STARTED", "AI_PROCESSING", "ASSEMBLY_PENDING", "FINALIZING"],
                "UPLOADED": ["INGESTION_STARTED", "FAILED", "ERROR"],
                "INGESTION_STARTED": ["INGESTION_COMPLETE", "FAILED", "ERROR"],
                "INGESTION_COMPLETE": ["AI_PROCESSING", "FAILED", "ERROR"],
                "AI_PROCESSING": ["AI_COMPLETE", "ASSEMBLY_PENDING", "FAILED", "ERROR"],
                "AI_COMPLETE": ["ASSEMBLY_PENDING", "ASSEMBLY_COMPLETE", "FAILED", "ERROR"],
                "ASSEMBLY_PENDING": ["AI_PROCESSING", "ASSEMBLY_COMPLETE", "READY_FOR_REVIEW", "PARTIAL_FAILED", "FAILED", "ERROR"],
                "ASSEMBLY_COMPLETE": ["FINALIZING", "READY_FOR_REVIEW", "PARTIAL_FAILED", "FAILED", "ERROR"],
                "READY_FOR_REVIEW": ["FINALIZING", "PARTIAL_FAILED", "FAILED", "ERROR"],
                "PARTIAL_FAILED": ["FINALIZING", "FAILED", "ERROR"],
                "FINALIZING": ["MATERIALIZING", "SNAPSHOTTING", "HYDRATION_READY", "FAILED", "ERROR", "MATERIALIZATION_PENDING"],
                "MATERIALIZATION_PENDING": ["MATERIALIZING", "FAILED", "ERROR"],
                "MATERIALIZING": ["SNAPSHOTTING", "HYDRATION_READY", "FAILED", "ERROR"],
                "SNAPSHOTTING": ["HYDRATION_READY", "FAILED", "ERROR"],
                "HYDRATION_READY": ["COMPLETED", "FINALIZED", "SUCCESS", "VOUCHER_CREATED"],
                "FINALIZED": ["COMPLETED", "SUCCESS", "VOUCHER_CREATED"],
                "FAILED": ["ERROR"],  # Dead end
                "ERROR": ["FAILED"],  # Dead end
                "COMPLETED": [],
                "SUCCESS": [],
                "VOUCHER_CREATED": []
            }
            
            # Helper to check if reachable in directed graph
            def is_reachable(start_node, end_node, visited=None):
                if visited is None: visited = set()
                if start_node == end_node: return True
                if start_node in visited: return False
                visited.add(start_node)
                for neighbor in ALLOWED_TRANSITIONS.get(start_node, []):
                    if is_reachable(neighbor, end_node, visited):
                        return True
                return False

            logger.info(f"[LIFECYCLE_TRANSITION_ATTEMPT] record={record_id} previous_state={current_status} requested_state={target_status}")
            
            if current_status and current_status != target_status:
                # Bypass validation if fatal error
                is_fatal = extra_data and extra_data.get('fatal_error_verified') is True
                if target_status in ["FAILED", "ERROR"] and is_fatal:
                    logger.critical(f"[VERIFIED_FATAL_ERROR_OVERRIDE] record={record_id} overriding {current_status} -> FAILED")
                else:
                    if not is_reachable(current_status, target_status):
                        logger.warning(f"[LIFECYCLE_TRANSITION_REJECTED] record={record_id} previous_state={current_status} requested_state={target_status} rejection_reason=BACKWARD_TRANSITION_OR_INVALID")
                        return
                    else:
                        logger.info(f"[LIFECYCLE_TRANSITION_ACCEPTED] record={record_id} previous_state={current_status} requested_state={target_status}")

            logger.info(f"[REDIS_STATE_WRITE] record={record_id} status={target_status}")
            try:
                self.redis.hset(status_key, "status", target_status)
                self.redis.hset(status_key, "progress", effective_progress)
                self.redis.hset(status_key, "updated_at", time.time())
                if extra_data:
                    for k, v in extra_data.items():
                        if isinstance(v, bool):
                            v = 'true' if v else 'false'
                        self.redis.hset(status_key, k, v)
                self.redis.expire(status_key, 3600)
                logger.info(f"[REDIS_STATE_COMMIT] record={record_id} status={target_status}")
            except Exception as e:
                logger.error(f"[REDIS_STATE_EXCEPTION] record={record_id} status={target_status} error={e}")
                raise

            logger.info(f"[STATUS_SYNC_OK] record={record_id} status={target_status} progress={effective_progress}%")

        self._safe_exec(_update)

    def get_session_status(self, record_id: str):
        """Gets live session status with strict deterministic contract."""
        def _get():
            status_key = f"session:{record_id}"
            data = self.redis.hgetall(status_key)
            if data:
                return {
                    "status": data.get("status", "UNKNOWN"),
                    "progress": float(data.get("progress", 0.0)),
                    "extra": {
                        "updated_at": float(data.get("updated_at", 0)),
                        "hydration_ready": data.get("hydration_ready") == 'true'
                    }
                }
            return {
                "status": "UNKNOWN",
                "progress": 0.0,
                "extra": {}
            }
            
        result = self._safe_exec(_get)
        if not result or not isinstance(result, dict):
            return {
                "status": "UNKNOWN",
                "progress": 0.0,
                "extra": {}
            }
        return result

    def get_redis_metrics(self):
        """Captures Redis system metrics (Phase 11)."""
        def _collect():
            info = self.redis.info()
            metrics_data = {
                "used_memory_mb": info.get("used_memory", 0) / 1024 / 1024,
                "ops_per_sec": info.get("instantaneous_ops_per_sec", 0),
                "connected_clients": info.get("connected_clients", 0),
                "key_count": self.redis.dbsize()
            }
            
            from core.observability import metrics
            metrics.set_gauge("redis:memory_mb", metrics_data["used_memory_mb"])
            metrics.set_gauge("redis:ops_per_sec", metrics_data["ops_per_sec"])
            metrics.set_gauge("redis:keys", metrics_data["key_count"])
            
            return metrics_data

        return self._safe_exec(_collect)

    def set_terminal_status(self, session_id: str, status: str, reason: str = ""):
        """
        [SURGICAL FIX] Directly marks a session as terminal without requiring DB records.
        Useful for aborting sessions when DB insertion fails (e.g. duplicate hash).
        """
        def _set():
            key = f"session_terminal:{session_id}"
            self.redis.hset(key, mapping={
                "status": status,
                "reason": reason,
                "timestamp": str(time.time())
            })
            self.redis.expire(key, 86400) # Keep for 24 hours
        return self._safe_exec(_set)

    def get_authoritative_session_state(self, session_id: str):
        """
        [PHASE 15] SINGLE SOURCE OF TRUTH FOR PIPELINE TERMINALITY.
        No API may infer completion locally. They must read this object.
        """
        def _get_auth():
            from ocr_pipeline.models import SessionFinalizationState, FinalizedSnapshot, InvoiceTempOCR
            from core.sqs import queue_service

            # 0. Check for explicit terminal session state (SURGICAL FIX for duplicates)
            try:
                term_key = f"session_terminal:{session_id}"
                if self.redis.exists(term_key):
                    term_data = self.redis.hgetall(term_key)
                    if term_data and term_data.get("status"):
                        logger.warning(f"[AUTHORITATIVE_TERMINAL_OVERRIDE] session={session_id} status={term_data.get('status')} reason={term_data.get('reason')}")
                        return {
                            'terminal': True,
                            'terminal_reason': term_data.get('reason', 'FAILED'),
                            'barrier_complete': True,
                            'snapshot_complete': True,
                            'materialization_complete': True,
                            'expected_pages': 0,
                            'completed_pages': 0,
                            'failed_pages': 0,
                        }
            except Exception as e:
                logger.error(f"[TERMINAL_KEY_CHECK_ERROR] {e}")

            # 1. Base DB State - Aggregate across all files in the session
            logger.info(f"[SESSION_AGGREGATE_START] session={session_id}")
            records = InvoiceTempOCR.objects.filter(upload_session_id=session_id).values_list('id', flat=True)
            record_ids = [str(r) for r in records]
            logger.info(f"[RECORD_TO_SESSION_MAPPING] session={session_id} records={record_ids}")
            
            states = list(SessionFinalizationState.objects.filter(id__in=record_ids))
            
            # DB-level page counts (written by assembly_worker after barrier release)
            db_expected = sum(s.expected_pages for s in states)
            db_completed = sum(s.completed_pages for s in states)
            db_failed = sum(s.failed_pages for s in states)
            logger.info(f"[BARRIER_STATE_READ] session={session_id} source=DB expected={db_expected} completed={db_completed} failed={db_failed}")

            redis_completed = 0
            redis_failed = 0
            for rid in record_ids:
                try:
                    s_key = f"assembly:{rid}:page_states"
                    page_states = self.redis.hgetall(s_key) or {}
                    rc = sum(1 for s in page_states.values() if s == "SUCCESS")
                    rf = sum(1 for s in page_states.values() if s == "FAILED")
                    redis_completed += rc
                    redis_failed += rf
                    logger.info(f"[REDIS_KEY_READ] record={rid} redis_completed={rc} redis_failed={rf}")
                except Exception as e:
                    logger.warning(f"[REDIS_KEY_READ_FAIL] record={rid} error={e}")

            # Use whichever is higher (monotonic guarantee)
            completed = max(db_completed, redis_completed)
            failed = max(db_failed, redis_failed)
            expected = db_expected
            logger.info(f"[BARRIER_STATE_AGGREGATED] session={session_id} source=REDIS_FIRST expected={expected} completed={completed} failed={failed}")
            
            # [EMPTY_SESSION_CONVERGENCE_BRANCH]
            # If there are no records, or expected/completed/failed are all 0, it's an empty session
            if expected == 0 and completed == 0 and failed == 0 and len(record_ids) == 0:
                logger.info(f"[EMPTY_SESSION_AUTOTERMINATED] session={session_id}")
                logger.info(f"[EMPTY_SESSION_POLLING_STOPPED] session={session_id}")
                logger.info(f"[EMPTY_SESSION_NO_WORK] session={session_id}")
                return {
                    "session_id": session_id,
                    "expected_pages": 0,
                    "completed_pages": 0,
                    "failed_pages": 0,
                    "terminal_count": 0,
                    "barrier_complete": True,
                    "finalize_complete": True,
                    "materialization_complete": True,
                    "snapshot_complete": True,
                    "ingestion_active": False,
                    "ai_active": False,
                    "assembly_active": False,
                    "finalize_active": False,
                    "materialization_active": False,
                    "export_active": False,
                    "active_workers": 0,
                    "terminal": True,
                    "terminal_reason": "EMPTY_SESSION_TERMINAL"
                }

            # Materialization and export completion: DB only (written by finalize_worker)
            # Once True, NEVER regress: use OR across all states
            finalize_complete = any(s.export_complete for s in states) if states else False
            materialization_complete = any(s.materialization_complete for s in states) if states else False
            logger.info(f"[MATERIALIZE_COMPLETE_READ] session={session_id} complete={materialization_complete}")
            logger.info(f"[MATERIALIZATION_AGGREGATE] session={session_id} complete={materialization_complete}")
            
            # 2. Redis statuses
            redis_statuses = []
            redis_hydration_ready = False
            for rid in record_ids:
                try:
                    raw = self.redis.hget(f"session:{rid}", "status")
                    hydration_flag = self.redis.hget(f"session:{rid}", "hydration_ready")
                    if raw:
                        redis_statuses.append(raw.upper())
                    if hydration_flag == 'true':
                        redis_hydration_ready = True
                except:
                    pass
            
            # The barrier is complete if all expected pages are processed (completed + failed)
            # OR if every Redis status is a terminal/hydration-ready state
            terminal_redis_states = {"HYDRATION_READY", "FINALIZED", "COMPLETED", "SUCCESS", "VOUCHER_CREATED", "FAILED", "ERROR"}
            redis_all_terminal = len(redis_statuses) > 0 and all(st in terminal_redis_states for st in redis_statuses)

            # 3. ORCHESTRATION_BOOTSTRAPPING DETECTION
            # [FIX] Distinguish two sub-cases when expected=0:
            #   A. Genuine bootstrap: ingestion hasn't run yet   → wait
            #   B. Hard ingestion failure: record.status=FAILED  → release as FAILED terminal
            # Without this, a hard ingestion failure (S3 read error, OCR crash, etc.)
            # leaves expected_pages=0 forever and the orchestrator loops forever with
            # ORCHESTRATION_BOOTSTRAPPING, blocking UI hydration permanently.
            all_bootstrapping = len(states) > 0 and expected == 0
            hard_ingestion_failed = False
            bootstrapping_failed_count = 0

            if all_bootstrapping:
                logger.info(f"[BOOTSTRAP_BEGIN] session={session_id} expected=0 states={len(states)} — checking record statuses")
                # Check if any InvoiceTempOCR record is in a terminal FAILED state
                # with expected_pages=0 (ingestion never wrote page count)
                failed_bootstrapping_records = InvoiceTempOCR.objects.filter(
                    upload_session_id=session_id,
                    status__in=['FAILED', 'ERROR']
                ).count()
                total_session_records = InvoiceTempOCR.objects.filter(upload_session_id=session_id).count()
                bootstrapping_failed_count = failed_bootstrapping_records
                logger.info(
                    f"[BOOTSTRAP_VALIDATED] session={session_id} "
                    f"total_records={total_session_records} failed_records={failed_bootstrapping_records}"
                )
                if failed_bootstrapping_records > 0 and failed_bootstrapping_records == total_session_records:
                    # ALL records are FAILED with expected_pages=0 — hard ingestion failure
                    hard_ingestion_failed = True
                    expected = total_session_records  # Treat each failed record as 1 expected page
                    failed = total_session_records
                    completed = 0
                    logger.info(
                        f"[BARRIER_STATE_INVALID] session={session_id} expected=0 — "
                        f"ALL {total_session_records} records are FAILED (hard ingestion failure). "
                        f"Synthesizing barrier: expected={expected} failed={failed}"
                    )

            logger.info(
                f"[ORCHESTRATOR_CONVERGENCE_CHECK] session={session_id} "
                f"expected={expected} completed={completed} failed={failed} "
                f"all_bootstrapping={all_bootstrapping} hard_ingestion_failed={hard_ingestion_failed} "
                f"redis_all_terminal={redis_all_terminal} redis_hydration_ready={redis_hydration_ready}"
            )

            # [ROOT CAUSE FIX: DO NOT REQUIRE COMPLETED == EXPECTED]
            # Use terminal_count (completed + failed + recovered + partial + continuation) 
            # Or simplified: if total_ready >= expected from get_barrier_state.
            # We already computed expected. Let's get total_ready across all records.
            total_redis_ready = 0
            for rid in record_ids:
                try:
                    s_key = f"assembly:{rid}:page_states"
                    num_pages = self.redis.hlen(s_key) or 0
                    total_redis_ready += num_pages
                except:
                    pass

            terminal_count = max(db_completed + db_failed, total_redis_ready)

            barrier_complete = (
                (terminal_count >= expected) and expected > 0
            ) or redis_all_terminal or redis_hydration_ready or hard_ingestion_failed

            snapshot_count = FinalizedSnapshot.objects.filter(session_id=session_id).count()
            # [FIX] Read snapshot_complete from DB state as well, to allow finalize_worker
            # to synthesize snapshot_complete=True on assembly failure.
            db_snapshot_complete = any((s.snapshot_created or s.snapshot_complete) for s in states) if states else False
            snapshot_complete = (snapshot_count > 0) or db_snapshot_complete
            
            # ── [PHASE 16: FORENSIC INVARIANTS] ──
            if db_snapshot_complete and snapshot_count == 0:
                logger.error(f"[INVARIANT_VIOLATION] session={session_id} snapshot_complete=True but snapshot_count=0 (DB mismatch)")
            if redis_all_terminal and not snapshot_complete and not hard_ingestion_failed:
                logger.error(f"[INVARIANT_VIOLATION] session={session_id} redis_all_terminal=True but snapshot_complete=False")
            
            logger.info(f"[SNAPSHOT_STATE_READ] session={session_id} snapshot_count={snapshot_count} db_snapshot_complete={db_snapshot_complete}")
            logger.info(f"[SNAPSHOT_AGGREGATE] session={session_id} complete={snapshot_complete} count={snapshot_count}")
            logger.info(f"[SESSION_AGGREGATE_RESULT] session={session_id} barrier={barrier_complete} snapshot={snapshot_complete} materialization={materialization_complete}")
            logger.info(f"[SESSION_STATE_AGGREGATE] session={session_id} expected={expected} completed={completed} failed={failed} barrier={barrier_complete} snapshot={snapshot_complete} materialization={materialization_complete} redis_statuses={redis_statuses}")

            # 2. Worker/Queue Activity and Starvation Detection
            q_ingest_v, q_ingest_i = queue_service.get_queue_stats("ingestion")
            q_ai_v, q_ai_i = queue_service.get_queue_stats("ai")
            q_assembly_v, q_assembly_i = queue_service.get_queue_stats("assembly")
            q_finalize_v, q_finalize_i = queue_service.get_queue_stats("finalize")
            q_materialize_v, q_materialize_i = queue_service.get_queue_stats("materialization")
            q_export_v, q_export_i = queue_service.get_queue_stats("export")
            
            q_ingest = q_ingest_v + q_ingest_i
            q_ai = q_ai_v + q_ai_i
            q_assembly = q_assembly_v + q_assembly_i
            q_finalize = q_finalize_v + q_finalize_i
            q_materialize = q_materialize_v + q_materialize_i
            q_export = q_export_v + q_export_i
            
            visible_queues = q_ingest_v + q_ai_v + q_assembly_v + q_finalize_v + q_materialize_v + q_export_v

            
            # [FIX] Active workers check — use TTL-backed per-role keys as primary source.
            # AND validate actual polling activity. Heartbeat alone is NOT enough.
            active_workers = 0
            polling_workers = 0
            cluster_env = os.getenv('CLUSTER_ENV', 'local')
            roles = ['INGESTION', 'AI', 'ASSEMBLY', 'FINALIZE', 'MATERIALIZE', 'EXPORT']
            try:
                for role in roles:
                    hb_key = f"worker_hb_{role}_{cluster_env}"
                    if self.redis.exists(hb_key):
                        active_workers += 1
                        logger.debug(f"[ACTIVE_WORKER_DETECTED] role={role} key={hb_key}")
                        
                        # Validate polling activity
                        last_poll = self.redis.hget("worker_polling_activity", f"{role}_{cluster_env}")
                        if last_poll and (time.time() - float(last_poll)) < 120:
                            polling_workers += 1
                        else:
                            logger.warning(f"[WORKER_FAKE_ALIVE_DETECTED] role={role} heartbeat exists but no polling activity for >120s")
                            
                logger.info(f"[ACTIVE_WORKERS_COUNT] session={session_id} active_workers={active_workers} polling_workers={polling_workers} source=TTL_KEYS")
            except Exception as e:
                # Fallback: legacy timestamp-based hash check (less reliable)
                try:
                    heartbeats = self.redis.hgetall("worker_heartbeats")
                    now = time.time()
                    # Use 45s window to match worker heartbeat TTL
                    active_workers = sum(1 for _, ts in heartbeats.items() if now - float(ts) < 45) if heartbeats else 0
                    logger.info(f"[ACTIVE_WORKERS_FALLBACK] session={session_id} active_workers={active_workers} source=HASH error={e}")
                except Exception:
                    pass
                
            # 3. Terminal Logic Evaluation
            # [FIX] active_workers has been removed as a terminal gate.
            # Workers are long-running daemon processes — they are ALWAYS alive in a healthy cluster.
            # Counting living worker processes (active_workers=6) is NOT the same as
            # "a worker is currently processing a task for THIS session."
            # The correct terminal conditions are purely data-driven:
            # [ROOT CAUSE FIX] Queue emptiness is OBSERVABILITY ONLY — NOT a convergence gate.
            # Invisible SQS messages (e.g. in-flight AI leases) must NOT block terminal release
            # after barrier+snapshot+materialization have all converged. See bug: TERMINAL_RELEASE_BLOCKED reason=QUEUE_ACTIVITY.
            queues_empty = (q_ingest + q_ai + q_assembly + q_finalize + q_materialize + q_export) == 0
            # Log queue depths for observability / debugging only:
            logger.info(
                f"[QUEUE_DEPTH_OBSERVABILITY] session={session_id} "
                f"q_ingest={q_ingest}(v={q_ingest_v},i={q_ingest_i}) "
                f"q_ai={q_ai}(v={q_ai_v},i={q_ai_i}) "
                f"q_assembly={q_assembly}(v={q_assembly_v},i={q_assembly_i}) "
                f"q_finalize={q_finalize}(v={q_finalize_v},i={q_finalize_i}) "
                f"q_materialize={q_materialize}(v={q_materialize_v},i={q_materialize_i}) "
                f"q_export={q_export}(v={q_export_v},i={q_export_i}) "
                f"queues_empty={queues_empty} [METRIC_ONLY — not used as convergence gate]"
            )

            # Authoritative Terminal Release Check
            import time
            last_updated = time.time()
            if states:
                last_updated = max((s.updated_at.timestamp() if s.updated_at else time.time()) for s in states)
            stall_duration = time.time() - last_updated

            terminal = False
            terminal_reason = "PROCESSING"

            # [PHASE 4: BOOTSTRAP DEADLOCK FIX]
            # Detect queue starvation / bootstrap timeout
            # If all_bootstrapping, but there are visible messages that aren't being consumed:
            # and no one is polling
            if all_bootstrapping and stall_duration > 300:
                logger.warning(f"[BOOTSTRAP_TIMEOUT] session={session_id} stalled for {stall_duration}s. Checking for queue starvation.")
                if q_ingest_v > 0 and polling_workers == 0:
                     logger.critical(f"[INGESTION_STARVATION] session={session_id} q_ingest_v={q_ingest_v} but no workers polling. Forcing terminal release.")
                     hard_ingestion_failed = True # Synthesize a failure to break deadlock
                     
            if visible_queues > 0 and polling_workers == 0 and stall_duration > 180:
                 logger.critical(f"[QUEUE_STARVATION_DETECTED] session={session_id} visible_messages={visible_queues} but 0 polling workers.")
                 if stall_duration > 600: # 10 mins complete death
                      logger.critical(f"[ORCHESTRATOR_RECOVERY_TRIGGER] session={session_id} forcing terminal release due to permanent queue starvation.")
                      hard_ingestion_failed = True

            # [FIX] Short-circuit: hard ingestion failure — all records FAILED before page counting.
            # No snapshot/materialization will ever exist. Release immediately as FAILED.
            if hard_ingestion_failed and queues_empty:
                terminal = True
                terminal_reason = "FAILED"
                logger.info(
                    f"[TERMINAL_RELEASE_GRANTED] session={session_id} reason=HARD_INGESTION_FAILED "
                    f"failed_records={bootstrapping_failed_count}"
                )
            elif hard_ingestion_failed:
                 # If queues aren't empty but ingestion failed, we might be starved
                 if polling_workers == 0:
                     terminal = True
                     terminal_reason = "FAILED_STARVED"
                     logger.info(f"[TERMINAL_RELEASE_FORCED] session={session_id} reason=HARD_INGESTION_FAILED_AND_STARVED")

            logger.info(
                f"[TERMINAL_RELEASE_CHECK] session={session_id} barrier={barrier_complete} "
                f"snapshot={snapshot_complete} materialization={materialization_complete} "
                f"queues_empty={queues_empty} active_workers={active_workers} polling_workers={polling_workers} "
                f"hard_ingestion_failed={hard_ingestion_failed}"
            )

            # [ROOT CAUSE FIX] Terminal release is now purely data-driven:
            #   barrier_complete AND snapshot_complete AND materialization_complete → RELEASE
            # Queue depth is NEVER used as a release gate.
            if not terminal:
                if barrier_complete and snapshot_complete and materialization_complete:
                    terminal = True
                    terminal_reason = "COMPLETED"
                    logger.info(f"[TERMINAL_RELEASE_GRANTED] session={session_id} reason=COMPLETED ")
                    logger.info(f"[AUTHORITATIVE_TERMINAL_GRANTED] session={session_id} reason=COMPLETED active_workers={active_workers}")
                    # Log queue depth for observability (not used as gate)
                    if not queues_empty:
                        logger.info(
                            f"[QUEUE_ACTIVITY_OBSERVED_AT_TERMINAL] session={session_id} "
                            f"q_ingest={q_ingest} q_ai={q_ai} q_assembly={q_assembly} "
                            f"q_finalize={q_finalize} q_materialize={q_materialize} q_export={q_export} "
                            f"[METRIC_ONLY — convergence already granted]"
                        )
                else:
                    if not barrier_complete:
                        if all_bootstrapping and not hard_ingestion_failed:
                            terminal_reason = "ORCHESTRATION_BOOTSTRAPPING"
                            logger.info(f"[TERMINAL_RELEASE_BLOCKED] session={session_id} reason=ORCHESTRATION_BOOTSTRAPPING stub rows exist but expected=0")
                            logger.info(f"[ORCHESTRATION_BOOTSTRAPPING] session={session_id} stub rows exist but expected=0")
                        else:
                            terminal_reason = "BARRIER_INCOMPLETE"
                            logger.info(f"[TERMINAL_RELEASE_BLOCKED] session={session_id} reason=BARRIER_INCOMPLETE expected={expected} completed={completed} failed={failed}")
                            logger.info(f"[TERMINALIZATION_BLOCKED_BARRIER] session={session_id} expected={expected} completed={completed} failed={failed}")
                    elif not snapshot_complete:
                        terminal_reason = "SNAPSHOT_PENDING"
                        logger.info(f"[TERMINAL_RELEASE_BLOCKED] session={session_id} reason=SNAPSHOT_PENDING")
                        logger.info(f"[TERMINALIZATION_BLOCKED_SNAPSHOT_PENDING] session={session_id}")
                    elif not materialization_complete:
                        terminal_reason = "MATERIALIZATION_PENDING"
                        logger.info(f"[TERMINAL_RELEASE_BLOCKED] session={session_id} reason=MATERIALIZATION_PENDING")
                        logger.info(f"[TERMINALIZATION_BLOCKED_MATERIALIZATION] session={session_id}")
                # Total failure path (all pages failed, none succeeded)
                # [FIX] Queue emptiness no longer gates the all-pages-failed release either.
                if barrier_complete and completed == 0 and failed > 0:
                    terminal = True
                    terminal_reason = "FAILED"
                    logger.info(f"[TERMINAL_RELEASE_GRANTED] session={session_id} reason=ALL_PAGES_FAILED failed={failed}")

                
            session_state = {
                "session_id": session_id,
                "expected_pages": expected,
                "completed_pages": completed,
                "failed_pages": failed,
                "terminal_count": terminal_count,
                
                "barrier_complete": barrier_complete,
                "finalize_complete": finalize_complete,
                "materialization_complete": materialization_complete,
                "snapshot_complete": snapshot_complete,
                
                "ingestion_active": q_ingest > 0,
                "ai_active": q_ai > 0,
                "assembly_active": q_assembly > 0,
                "finalize_active": q_finalize > 0,
                "materialization_active": q_materialize > 0,
                "export_active": q_export > 0,
                
                "active_workers": active_workers,
                "terminal": terminal,
                "terminal_reason": terminal_reason
            }
            return session_state

        result = self._safe_exec(_get_auth)
        if result is None:
            return {
                "session_id": session_id,
                "expected_pages": 0,
                "completed_pages": 0,
                "failed_pages": 0,
                "terminal_count": 0,
                "barrier_complete": False,
                "finalize_complete": False,
                "materialization_complete": False,
                "snapshot_complete": False,
                "ingestion_active": False,
                "ai_active": False,
                "assembly_active": False,
                "finalize_active": False,
                "materialization_active": False,
                "export_active": False,
                "active_workers": 0,
                "terminal": False,
                "terminal_reason": "ERROR"
            }
        return result

orchestrator = RedisOrchestrator()
