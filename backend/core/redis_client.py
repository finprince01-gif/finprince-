import redis
import os
import json
import time
import logging
from django.conf import settings

logger = logging.getLogger("RedisClient")


def _safe_int(val, key: str = "", client=None, default: int = 0) -> int:
    """
    Safe Redis integer parser.
    - Never raises on bad values ("OK", "K", None, non-numeric strings)
    - Logs unexpected values with the key name for traceability
    - Optionally resets the corrupted Redis key to 0 so subsequent reads are clean
    """
    try:
        return int(val)
    except (TypeError, ValueError):
        logger.error(
            f"[REDIS ERROR] key={key!r}, raw_value={val!r} — "
            f"invalid literal for int(). Resetting to {default}."
        )
        if client and key:
            try:
                client.set(key, default)
            except Exception:
                pass
        return default

class RedisClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            import threading
            cls._instance = super(RedisClient, cls).__new__(cls)
            cls._instance._initialized = False
            cls._instance.client = None
            cls._instance.available = False
            # LOCAL SANITY BOUND: hard cap per worker in degraded/partition mode
            cls._instance.local_sem = threading.BoundedSemaphore(5)
            cls._instance._init_connection()
        return cls._instance

    def _init_connection(self):
        """Initialize Redis connection with retries, exponential backoff, and loud failures in production"""
        # Determine dev mode from settings
        try:
            is_dev = getattr(settings, 'DEBUG', True)
        except Exception:
            is_dev = os.getenv('DJANGO_DEBUG', 'False') == 'True'

        redis_url = getattr(settings, 'REDIS_URL', os.getenv('REDIS_URL', 'redis://localhost:6379/0'))

        base_delay = 1
        max_attempts = 4 if not is_dev else 2
        
        logger.info(f"[REDIS CONNECT] Attempting connection via URL={redis_url}, max_attempts={max_attempts}, dev_mode={is_dev}")
        
        for i in range(max_attempts):
            try:
                # Set dynamic timeout: slightly longer for production
                timeout = 5.0 if not is_dev else 1.0
                
                self.client = redis.from_url(redis_url, decode_responses=True, socket_timeout=timeout)
                self.client.ping()

                # MANDATORY VALIDATION: SET, GET, DELETE
                test_key = f"redis_test_startup_{int(time.time())}"
                self.client.set(test_key, "1", ex=10)
                val = self.client.get(test_key)
                if val != "1":
                    raise ValueError("Redis validation failed: GET test_key returned incorrect value")
                self.client.delete(test_key)

                self.available = True
                self._initialized = True
                logger.info(f"[REDIS SUCCESS] Production-grade Redis connected and validated successfully.")
                return
            except Exception as e:
                logger.warning(f"[REDIS ATTEMPT FAILED] Attempt {i+1}/{max_attempts} failed. Reason: {e}")
                if i == max_attempts - 1:
                    self.available = False
                    self._initialized = True
                    if not is_dev:
                        # Production mode: fail loudly
                        raise RuntimeError(f"CRITICAL: Production Redis is required but failed startup validation: {e}") from e
                    else:
                        logger.info(f"[REDIS FALLBACK] Falling back to local mode in development.")
                else:
                    sleep_time = base_delay * (2 ** i)
                    time.sleep(sleep_time)


    def get_client(self):
        if not self.available:
            return None
        return self.client

    def is_healthy(self):
        """Check if Redis is currently alive"""
        try:
            if self.client:
                self.client.ping()
                self.available = True
                return True
        except:
            pass
        self.available = False
        return False

    # --- Queueing Helpers (with Fallback) ---
    def push_to_queue(self, queue_name: str, data: dict):
        if not self.available:
            return False
        try:
            self.client.lpush(f"queue:{queue_name}", json.dumps(data))
            return True
        except Exception as e:
            logger.error(f"[REDIS ERROR] Push failed: {e}")
            self.available = False
            return False

    def pop_from_queue(self, queue_names: list, timeout: int = 0):
        if not self.available:
            return None, None
        try:
            if isinstance(queue_names, str):
                queue_names = [queue_names]
            keys = [f"queue:{name}" for name in queue_names]
            res = self.client.brpop(keys, timeout=timeout)
            if res:
                return json.loads(res[1]), res[0].replace("queue:", "")
        except Exception as e:
            logger.error(f"[REDIS ERROR] Pop failed: {e}")
            self.available = False
        return None, None

    def get_queue_length(self, queue_names: list):
        if not self.available:
            return 0
        try:
            if isinstance(queue_names, str):
                return self.client.llen(f"queue:{queue_names}")
            total = 0
            for name in queue_names:
                total += self.client.llen(f"queue:{name}")
            return total
        except:
            self.available = False
            return 0

    # --- Sliding Window Rate Limiter (with Fallback) ---
    def check_sliding_window(self, key: str, limit: int, window: float = 1.0):
        if not self.available:
            # Fallback to "always allow" or local logic in proxy
            return True, 0, 0
        try:
            now = time.time()
            key = f"rl:sw:{key}"
            pipeline = self.client.pipeline()
            pipeline.zremrangebyscore(key, 0, now - window)
            pipeline.zcard(key)
            results = pipeline.execute()
            count = results[1]
            if int(count) >= int(limit):
                oldest = self.client.zrange(key, 0, 0, withscores=True)
                retry_after = max(0, oldest[0][1] + window - now) if oldest else window
                return False, count, retry_after
            import uuid
            member = f"{now}:{uuid.uuid4()}"
            self.client.zadd(key, {member: now})
            self.client.expire(key, int(window) + 2)
            return True, count + 1, 0
        except Exception as e:
            logger.error(f"[REDIS ERROR] Rate limit check failed: {e}")
            self.available = False
            return True, 0, 0

    # --- Global Token Bucket (with Fallback) ---
    def acquire_token(self, key: str, max_tokens: int, refill_rate: float):
        if not self.available:
            return True
        try:
            now = time.time()
            bucket_key = f"tb:{key}"
            lua = """
            local key = KEYS[1]
            local max_tokens = tonumber(ARGV[1])
            local refill_rate = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])
            local bucket = redis.call('hgetall', key)
            local tokens = max_tokens
            local last_refill = now
            if #bucket > 0 then
                local data = {}
                for i=1, #bucket, 2 do data[bucket[i]] = bucket[i+1] end
                tokens = tonumber(data['tokens'])
                last_refill = tonumber(data['last_refill'])
            end
            local delta = (now - last_refill) * refill_rate
            tokens = math.min(max_tokens, tokens + delta)
            if tokens >= 1 then
                tokens = tokens - 1
                redis.call('hmset', key, 'tokens', tokens, 'last_refill', now)
                return 1
            else return 0 end
            """
            res = self.client.register_script(lua)(keys=[bucket_key], args=[max_tokens, refill_rate, now])
            return bool(res)
        except:
            self.available = False
            return True

    def record_metric(self, name: str, value: float):
        if not self.available: return
        try:
            self.client.hset("metrics", name, value)
            self.client.lpush(f"metrics:history:{name}", f"{int(time.time())}:{value}")
            self.client.ltrim(f"metrics:history:{name}", 0, 99)
        except:
            self.available = False

    # ═══════════════════════════════════════════════════════════════
    # GLOBAL COORDINATION LAYER v3 — Self-Consistent, Partition-Tolerant
    # ═══════════════════════════════════════════════════════════════

    # ── SYSTEM MODE ─────────────────────────────────────────────────
    # NORMAL     → full concurrency, full intake
    # DEGRADED   → 60% concurrency, slow intake
    # PROTECTIVE → 30% concurrency, reject new jobs
    MODES = {
        'NORMAL':     {'concurrency_pct': 1.0,  'intake': True,  'reject': False},
        'DEGRADED':   {'concurrency_pct': 0.6,  'intake': True,  'reject': False},
        'PROTECTIVE': {'concurrency_pct': 0.3,  'intake': False, 'reject': True},
    }

    def get_system_mode(self) -> str:
        """
        Returns current cluster mode. Workers treat this as advisory,
        always applying a local sanity bound regardless.
        """
        if not self.available:
            return 'DEGRADED'
        try:
            mode = self.client.get("sys:mode") or 'NORMAL'
            return mode if mode in self.MODES else 'NORMAL'
        except:
            return 'DEGRADED'

    def set_system_mode(self, mode: str):
        if not self.available or mode not in self.MODES: return
        try:
            self.client.set("sys:mode", mode, ex=300)  # 5 min TTL — auto-heals
            logger.warning(f"[SYSTEM MODE] → {mode}")
        except: pass

    def get_effective_limit(self, base_limit: int) -> int:
        """
        Returns the concurrency limit adjusted by current system mode.
        Always clamps between 1 and base_limit (sanity bound).
        """
        mode = self.get_system_mode()
        pct  = self.MODES.get(mode, self.MODES['DEGRADED'])['concurrency_pct']
        return max(1, int(base_limit * pct))

    # ── ANTI-OSCILLATING CIRCUIT BREAKER ────────────────────────────
    # Breaker requires SUCCESSES_TO_CLOSE sequential successes in HALF_OPEN
    # before fully closing. Prevents rapid OPEN↔CLOSED flapping.
    CB_OPEN_THRESHOLD   = 10   # failures to open
    CB_COOLDOWN_SECS    = 90   # min time before HALF_OPEN
    SUCCESSES_TO_CLOSE  = 5    # successes needed in HALF_OPEN to close
    HALF_OPEN_TRAFFIC   = 0.15 # only 15% of workers probe in HALF_OPEN

    def get_circuit_breaker_state(self, name: str):
        """
        Returns (state, failures, is_blocking).
        is_blocking: whether this worker should skip processing entirely.
        Reads state twice (read-verify) to guard against stale Redis.
        """
        if not self.available:
            # Partition mode: treat breaker as CLOSED but apply local limits
            return 'CLOSED', 0, False

        try:
            key = f"cb:{name}"
            # READ-TWICE VERIFICATION: discard if inconsistent
            stats1 = self.client.hgetall(key)
            time.sleep(0.001)  # 1ms — force clock tick
            stats2 = self.client.hgetall(key)

            state1 = stats1.get('state', 'CLOSED')
            state2 = stats2.get('state', 'CLOSED')
            # If both reads disagree → conservative: trust the worse state
            state = state1 if state1 in ('OPEN', 'PROTECTIVE') else state2

            failures     = _safe_int(stats2.get('failures', 0),  key=f"cb:{name}:failures")
            successes    = _safe_int(stats2.get('successes', 0),  key=f"cb:{name}:successes")
            last_fail_ts = float(stats2.get('last_fail', 0) or 0)
            now          = time.time()

            # GRADUATED RECOVERY: OPEN → HALF_OPEN after cooldown
            if state == 'OPEN' and (now - last_fail_ts) > self.CB_COOLDOWN_SECS:
                self.client.hset(key, 'state', 'HALF_OPEN')
                state = 'HALF_OPEN'

            # HALF_OPEN: only a fraction of workers are allowed to probe
            if state == 'HALF_OPEN':
                import random
                # Stochastic gate: only HALF_OPEN_TRAFFIC fraction of calls proceed
                is_blocking = (random.random() > self.HALF_OPEN_TRAFFIC)
                return state, failures, is_blocking

            is_blocking = (state == 'OPEN')
            return state, failures, is_blocking

        except Exception as e:
            logger.warning(f"[CB] Read failed: {e} — defaulting CLOSED")
            return 'CLOSED', 0, False

    def record_cb_failure(self, name: str):
        """Atomic failure record. Opens breaker if threshold crossed."""
        if not self.available: return
        try:
            key = f"cb:{name}"
            lua = """
            local key   = KEYS[1]
            local thresh = tonumber(ARGV[1])
            local now    = tonumber(ARGV[2])
            local f = redis.call('hincrby', key, 'failures', 1)
            redis.call('hset', key, 'last_fail', now)
            redis.call('hset', key, 'successes', 0)
            if f >= thresh then
                redis.call('hset', key, 'state', 'OPEN')
            end
            return f
            """
            self.client.register_script(lua)(
                keys=[key], args=[self.CB_OPEN_THRESHOLD, time.time()])
            # Escalate system mode
            self._maybe_escalate_mode(name)
        except: pass

    def record_cb_success(self, name: str):
        """
        In HALF_OPEN: accumulate successes.
        After SUCCESSES_TO_CLOSE, close the breaker.
        """
        if not self.available: return
        try:
            key = f"cb:{name}"
            lua = """
            local key   = KEYS[1]
            local need  = tonumber(ARGV[1])
            local state = redis.call('hget', key, 'state') or 'CLOSED'
            if state == 'HALF_OPEN' then
                local s = redis.call('hincrby', key, 'successes', 1)
                if s >= need then
                    redis.call('hmset', key, 'state', 'CLOSED', 'failures', 0, 'successes', 0)
                    return 'CLOSED'
                end
                return 'HALF_OPEN'
            elseif state == 'CLOSED' then
                redis.call('hset', key, 'failures', 0)
                return 'CLOSED'
            end
            return state
            """
            self.client.register_script(lua)(keys=[key], args=[self.SUCCESSES_TO_CLOSE])
        except: pass

    def _maybe_escalate_mode(self, cb_name: str):
        """Escalate system mode based on failure accumulation."""
        if not self.available: return
        try:
            failures = _safe_int(
                self.client.hget(f"cb:{cb_name}", 'failures'),
                key=f"cb:{cb_name}:failures",
                client=self.client,
            )
            if failures >= self.CB_OPEN_THRESHOLD * 2:
                self.set_system_mode('PROTECTIVE')
            elif failures >= self.CB_OPEN_THRESHOLD:
                self.set_system_mode('DEGRADED')
        except: pass

    def reset_cb(self, name: str):
        """Hard reset — called by operators or reconciliation jobs."""
        if not self.available: return
        try:
            self.client.hmset(f"cb:{name}", {
                'state': 'CLOSED', 'failures': 0, 'successes': 0})
            self.set_system_mode('NORMAL')
        except: pass

    # ── PARTITION-TOLERANT SEMAPHORE ─────────────────────────────────
    def acquire_semaphore(self, name: str, base_limit: int, ttl: int = 90):
        """
        Partition-tolerant rate limiter.
        - Reads effective_limit from mode-aware calculation
        - Applies LOCAL sanity bound: never exceeds local_sem even if Redis says OK
        - Both gates must pass (dual-check)
        """
        effective_limit = self.get_effective_limit(base_limit)

        if not self.available:
            # Conservative local fallback — no Redis coordination
            return self.local_sem.acquire(blocking=False)

        # DUAL-CHECK: local gate first (fast, no network)
        local_ok = self.local_sem.acquire(blocking=False)
        if not local_ok:
            return False  # Local sanity bound already saturated

        try:
            key = f"sem:{name}"
            lua = """
            local key   = KEYS[1]
            local limit = tonumber(ARGV[1])
            local ttl   = tonumber(ARGV[2])
            local cur   = tonumber(redis.call('get', key) or "0")
            if cur < limit then
                local nv = redis.call('incr', key)
                if nv == 1 then redis.call('expire', key, ttl) end
                return nv
            end
            return 0
            """
            res = self.client.register_script(lua)(keys=[key], args=[effective_limit, ttl])
            if not res:
                # Global limit reached — release local gate too
                try: self.local_sem.release()
                except: pass
                return False
            # Track global concurrency
            self.client.incrby("global:concurrency", 1)
            return True
        except Exception as e:
            logger.error(f"[SEM] acquire failed: {e}")
            self.available = False
            # Keep local gate held — worker may still proceed (degraded)
            return True

    def release_semaphore(self, name: str):
        """Release both local and global semaphore slots."""
        # Always release local first
        try: self.local_sem.release()
        except: pass

        if not self.available: return
        try:
            key = f"sem:{name}"
            lua = """
            local key = KEYS[1]
            local v   = redis.call('get', key)
            if v and tonumber(v) > 0 then
                redis.call('decr', key)
                return 1
            end
            return 0
            """
            self.client.register_script(lua)(keys=[key])
            self.client.decrby("global:concurrency", 1)
        except Exception as e:
            logger.error(f"[SEM] release failed: {e}")
            self.available = False

    # ── GLOBAL STATE & COUNTER RECONCILIATION ────────────────────────
    def get_global_state(self) -> dict:
        """Advisory global state. Workers apply local sanity bounds regardless."""
        if not self.available:
            return {'degraded': True, 'concurrency': 0, 'mode': 'DEGRADED'}
        try:
            pipe = self.client.pipeline()
            pipe.get("global:concurrency")
            pipe.get("sys:mode")
            results = pipe.execute()
            return {
                'degraded':    False,
                'concurrency': _safe_int(results[0], key='global:concurrency', client=self.client),
                'mode':        results[1] or 'NORMAL',
            }
        except:
            return {'degraded': True, 'concurrency': 0, 'mode': 'DEGRADED'}

    def reconcile_concurrency(self, name: str, actual_count: int):
        """
        COUNTER RECONCILIATION: periodically called by a watchdog.
        Corrects drift between Redis counter and actual running tasks.
        """
        if not self.available: return
        try:
            key = f"sem:{name}"
            redis_val = _safe_int(
                self.client.get(key),
                key=key,
                client=self.client,
            )
            drift = redis_val - actual_count
            if abs(drift) > 2:
                logger.warning(f"[RECONCILE] Counter drift={drift}. Correcting {key}: {redis_val}→{actual_count}")
                self.client.set(key, max(0, actual_count), keepttl=True)
                self.client.set("global:concurrency", max(0, actual_count))
        except Exception as e:
            logger.error(f"[RECONCILE] Failed: {e}")

    # ── ADMISSION CONTROL (Token Bucket at API layer) ─────────────────
    def check_admission(self, tenant_id: str, burst: int = 20, rate: float = 2.0) -> bool:
        """
        Token-bucket admission control per tenant.
        burst: max tokens (peak), rate: tokens/sec replenishment.
        Returns True if admitted, False if rejected.
        """
        if not self.available:
            return True  # Fail-open for admission when Redis down
        try:
            now = time.time()
            key = f"admit:{tenant_id}"
            lua = """
            local key   = KEYS[1]
            local burst = tonumber(ARGV[1])
            local rate  = tonumber(ARGV[2])
            local now   = tonumber(ARGV[3])
            local d     = redis.call('hgetall', key)
            local tokens = burst
            local last   = now
            if #d > 0 then
                local m = {}
                for i=1,#d,2 do m[d[i]] = d[i+1] end
                tokens = tonumber(m['tokens'] or burst)
                last   = tonumber(m['last']   or now)
            end
            local refill = (now - last) * rate
            tokens = math.min(burst, tokens + refill)
            if tokens >= 1 then
                redis.call('hmset', key, 'tokens', tokens - 1, 'last', now)
                redis.call('expire', key, 3600)
                return 1
            end
            return 0
            """
            res = self.client.register_script(lua)(keys=[key], args=[burst, rate, now])
            return bool(res)
        except Exception as e:
            logger.error(f"[ADMIT] check failed: {e}")
            return True  # Fail-open

redis_client = RedisClient()
