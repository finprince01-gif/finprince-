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
        session_key = f"assembly:{record_id}"
        completed_key = f"{session_key}:completed_pages"
        failed_key = f"{session_key}:failed_pages"
        lock_key = f"lock:barrier:{record_id}"

        try:
            # [PHASE 11.9] ATOMIC READ-MODIFY-WRITE
            with self.redis.lock(lock_key, timeout=10):
                logger.info(f"[BARRIER_LOCK_ACQUIRED] record={record_id}")
                
                # 1. CROSS-SET DUPLICATE DETECTION
                # A page must affect the barrier state EXACTLY once.
                already_completed = self.redis.sismember(completed_key, page_number)
                already_failed = self.redis.sismember(failed_key, page_number)
                
                if already_completed or already_failed:
                    logger.warning(f"[BARRIER_DUPLICATE_REJECTED] record={record_id} page={page_number} (already_{'completed' if already_completed else 'failed'})")
                    return False
                
                # 2. APPLY ATOMIC COUNTER
                if is_failed:
                    self.redis.sadd(failed_key, page_number)
                    logger.info(f"[BARRIER_FAILED_INCREMENT] record={record_id} page={page_number}")
                else:
                    self.redis.sadd(completed_key, page_number)
                    logger.info(f"[BARRIER_SUCCESS_INCREMENT] record={record_id} page={page_number}")
                
                logger.info(f"[BARRIER_COUNTER_APPLIED] record={record_id} page={page_number} status={'FAILED' if is_failed else 'SUCCESS'}")
                
                self.redis.hset(session_key, "updated_at", time.time())
                self.redis.expire(session_key, 86400)
                self.redis.expire(completed_key, 86400)
                self.redis.expire(failed_key, 86400)
        except Exception as e:
            logger.error(f"[BARRIER_SYNC_ERROR] record={record_id} error={e}")
            raise

        latency = (time.time() - t_start) * 1000
        observability.redis_metric(event="BARRIER_UPDATE", record_id=record_id, latency_ms=latency)
        metrics.record_latency("redis:barrier_latency", latency)
        return True

    def get_barrier_state(self, record_id: str, expected_pages: int):
        """Checks if the barrier is ready (all pages accounted for)."""
        session_key = f"assembly:{record_id}"
        completed_key = f"{session_key}:completed_pages"
        failed_key = f"{session_key}:failed_pages"
        
        completed_count = self.redis.scard(completed_key)
        failed_count = self.redis.scard(failed_key)
        total_ready = completed_count + failed_count
        
        # [PHASE 11.9] Forensic Snapshot
        logger.info(f"[BARRIER_TERMINAL_PROGRESS] record={record_id} terminal={total_ready} expected={expected_pages} success={completed_count} failed={failed_count}")
        
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
        else:
            logger.info(f"[BARRIER_INCOMPLETE] record={record_id} progress={total_ready}/{expected_pages}")
            updated_at_str = self.redis.hget(session_key, "updated_at")
            if updated_at_str:
                try:
                    updated_at = float(updated_at_str)
                    if time.time() - updated_at > 60:
                        completed_set = self.redis.smembers(completed_key)
                        failed_set = self.redis.smembers(failed_key)
                        received_pages = sorted([int(p) for p in list(completed_set) + list(failed_set)])
                        missing_pages = [p for p in range(1, expected_pages + 1) if p not in received_pages]
                        logger.error(f"[BARRIER_TIMEOUT] record={record_id} missing_pages={missing_pages}")
                except: pass
                
        return state

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
    def update_session_status(self, record_id: str, status: str, progress: float = 0.0):
        """Updates live session status for frontend polling."""
        def _update():
            status_key = f"session:{record_id}"
            self.redis.hset(status_key, "status", status)
            self.redis.hset(status_key, "progress", progress)
            self.redis.hset(status_key, "updated_at", time.time())
            self.redis.expire(status_key, 3600)
            logger.info(f"[STATUS_SYNC_OK] record={record_id} status={status} progress={progress}%")

        self._safe_exec(_update)

    def get_session_status(self, record_id: str):
        """Gets live session status."""
        def _get():
            status_key = f"session:{record_id}"
            data = self.redis.hgetall(status_key)
            if data:
                return {
                    "status": data.get("status"),
                    "progress": float(data.get("progress", 0.0)),
                    "updated_at": float(data.get("updated_at", 0))
                }
            return None
        return self._safe_exec(_get)

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

orchestrator = RedisOrchestrator()
