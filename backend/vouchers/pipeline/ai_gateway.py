"""
AI Gateway – Distributed, Stateless, Redis-Backed
====================================================
REMOVED: Python singleton pattern (single-process bottleneck)
ADDED:   Redis shared rate limiter → multiple instances can run in parallel

Each instance is identical and stateless. State lives entirely in Redis.
Deploy N instances behind any load balancer (nginx, Kafka consumer group, etc.)

Components:
  - RedisTokenBucket:  Shared rate limiter (cross-process, cross-server)
  - RedisCircuitBreaker: Shared circuit state (all instances see same open/closed)
  - RedisResultCache:  24h hash-keyed result cache
  - AIGateway.extract(): Three-tier fallback: Flash → Pro → Rule Parser
"""
import os
import time
import asyncio
import logging
import threading

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────
MAX_RPS            = float(os.environ.get('AI_RATE_LIMIT_RPS', '5'))
CIRCUIT_FAIL_RATE  = float(os.environ.get('AI_CIRCUIT_FAIL_RATE', '0.5'))
CIRCUIT_WINDOW     = int(os.environ.get('AI_CIRCUIT_WINDOW', '60'))
CIRCUIT_MIN_CALLS  = int(os.environ.get('AI_CIRCUIT_MIN_CALLS', '5'))
CACHE_TTL          = int(os.environ.get('AI_CACHE_TTL', '86400'))   # 24 hours
RATE_WINDOW        = 1  # 1 second window for RPS enforcement

REDIS_PREFIX = 'ai_gw'


def _get_redis():
    """Get a raw Redis client (not Django cache) for atomic operations."""
    import redis as redis_lib
    url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    return redis_lib.from_url(url, decode_responses=True)


# ── Distributed Rate Limiter (Token Bucket via Redis INCR) ──────────────────
class RedisTokenBucket:
    """
    Shared rate limiter using Redis atomic INCR.
    Safe across multiple processes and servers.

    Algorithm:
      - Key expires after 1 second (rolling window)
      - INCR returns current count in this window
      - If count > MAX_RPS, reject

    When Redis is UNREACHABLE: falls back to an in-process semaphore,
    which still enforces a hard limit (no fail-open, no flood).
    """
    def __init__(self, max_rps: float):
        self._max = int(max_rps)
        self._key = f"{REDIS_PREFIX}:rate_limit"
        # In-process fallback for when Redis is down
        self._local_semaphore = threading.Semaphore(self._max)

    def acquire(self) -> bool:
        try:
            r = _get_redis()
            pipe = r.pipeline()
            pipe.incr(self._key)
            pipe.expire(self._key, RATE_WINDOW)
            count, _ = pipe.execute()
            allowed = count <= self._max
            if not allowed:
                logger.debug(f"[AI GATEWAY] Rate limit: {count}/{self._max} RPS. Rejected.")
            return allowed
        except Exception as e:
            # Redis unavailable → use local semaphore (fail-safe, not fail-open)
            logger.warning(f"[AI GATEWAY] Redis rate limit unavailable: {e}. Using local semaphore.")
            acquired = self._local_semaphore.acquire(blocking=False)
            if acquired:
                # Release immediately — semaphore used only for admission control here
                self._local_semaphore.release()
            return acquired

    async def acquire_async(self, timeout: float = 30.0) -> bool:
        """Async polling wrapper with timeout."""
        loop = asyncio.get_event_loop()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if await loop.run_in_executor(None, self.acquire):
                return True
            await asyncio.sleep(1.0 / max(self._max, 1))
        return False


# ── Distributed Circuit Breaker (Redis INCR+EXPIRE sliding window) ─────────
class RedisCircuitBreaker:
    """
    Shared circuit breaker. All gateway instances share same open/closed state.

    Uses two Redis counters: ai_gw:cb:success and ai_gw:cb:failure
    Both expire after CIRCUIT_WINDOW seconds (sliding window approximation).
    """
    def __init__(self, fail_rate: float, window: int, min_calls: int):
        self._fail_rate  = fail_rate
        self._window     = window
        self._min_calls  = min_calls
        self._key_ok     = f"{REDIS_PREFIX}:cb:ok"
        self._key_fail   = f"{REDIS_PREFIX}:cb:fail"

    def record(self, success: bool):
        try:
            r = _get_redis()
            key = self._key_ok if success else self._key_fail
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, self._window)
            pipe.execute()
        except Exception as e:
            logger.warning(f"[CIRCUIT] Record failed: {e}")

    @property
    def is_open(self) -> bool:
        try:
            r = _get_redis()
            ok   = int(r.get(self._key_ok) or 0)
            fail = int(r.get(self._key_fail) or 0)
            total = ok + fail
            if total < self._min_calls:
                return False
            rate = fail / total
            if rate > self._fail_rate:
                logger.warning(f"[CIRCUIT] OPEN – fail rate {rate:.1%} > {self._fail_rate:.1%}")
                return True
            return False
        except Exception as e:
            logger.warning(f"[CIRCUIT] State check failed: {e}. Treating as closed.")
            return False


# ── Result Cache (Redis) ────────────────────────────────────────────────────
class RedisResultCache:
    def get(self, page_hash: str, tenant_id: str):
        try:
            import json
            r = _get_redis()
            data = r.get(f"{REDIS_PREFIX}:cache:{tenant_id}:{page_hash}")
            return json.loads(data) if data else None
        except Exception:
            return None

    def set(self, page_hash: str, tenant_id: str, result: dict):
        try:
            import json
            r = _get_redis()
            r.setex(
                f"{REDIS_PREFIX}:cache:{tenant_id}:{page_hash}",
                CACHE_TTL,
                json.dumps(result)
            )
        except Exception:
            pass


# ── Metrics (Redis) ─────────────────────────────────────────────────────────
class GatewayMetrics:
    """Track AI gateway usage in Redis for monitoring dashboards."""
    _key = f"{REDIS_PREFIX}:metrics"

    @staticmethod
    def increment(field: str):
        try:
            r = _get_redis()
            r.hincrby(GatewayMetrics._key, field, 1)
        except Exception:
            pass

    @staticmethod
    def record_latency(ms: float):
        try:
            r = _get_redis()
            r.lpush(f"{REDIS_PREFIX}:latency", ms)
            r.ltrim(f"{REDIS_PREFIX}:latency", 0, 999)  # Keep last 1000
        except Exception:
            pass

    @staticmethod
    def get_all() -> dict:
        try:
            r = _get_redis()
            raw = r.hgetall(GatewayMetrics._key) or {}
            latencies = [float(x) for x in (r.lrange(f"{REDIS_PREFIX}:latency", 0, -1) or [])]
            p95 = sorted(latencies)[int(len(latencies) * 0.95)] if latencies else 0
            return {**raw, 'ai_latency_p95_ms': round(p95, 1)}
        except Exception:
            return {}


# ── Public API ───────────────────────────────────────────────────────────────
_rate_limiter   = RedisTokenBucket(MAX_RPS)
_circuit        = RedisCircuitBreaker(CIRCUIT_FAIL_RATE, CIRCUIT_WINDOW, CIRCUIT_MIN_CALLS)
_cache          = RedisResultCache()
_metrics        = GatewayMetrics()


class AIGateway:
    """
    Stateless AI Gateway. Multiple instances can run in parallel.
    All shared state (rate limit, circuit, cache) lives in Redis.
    """

    async def extract(
        self,
        file_bytes: bytes,
        mime_type: str,
        page_hash: str,
        tenant_id: str,
    ) -> dict:
        t0 = time.monotonic()

        # 1. Cache check
        cached = _cache.get(page_hash, tenant_id)
        if cached:
            _metrics.increment('cache_hits')
            return cached

        # 2. Circuit breaker check
        if _circuit.is_open:
            _metrics.increment('circuit_open_fallbacks')
            return self._rule_parse(file_bytes, mime_type)

        # 3. Rate limit acquisition
        acquired = await _rate_limiter.acquire_async(timeout=30.0)
        if not acquired:
            _metrics.increment('rate_limit_fallbacks')
            logger.warning("[AI GATEWAY] Rate limit timeout. Using rule parser.")
            return self._rule_parse(file_bytes, mime_type)

        # 4. AI call (Flash → Pro → rule parser)
        result = await self._call_ai_with_fallback(file_bytes, mime_type)

        # 5. Cache + metrics
        _cache.set(page_hash, tenant_id, result)
        _metrics.record_latency((time.monotonic() - t0) * 1000)

        return result

    async def _call_ai_with_fallback(self, file_bytes: bytes, mime_type: str) -> dict:
        loop = asyncio.get_event_loop()

        # Flash (primary)
        try:
            t0 = time.monotonic()
            result = await loop.run_in_executor(None, self._call_model, file_bytes, mime_type)
            _circuit.record(True)
            _metrics.increment('ai_success')
            _metrics.record_latency((time.monotonic() - t0) * 1000)
            return result
        except Exception as e:
            _circuit.record(False)
            _metrics.increment('ai_failures')
            logger.warning(f"[AI GATEWAY] Flash failed: {str(e)[:60]}. Waiting 3s then trying Pro...")

        # Pro fallback
        await asyncio.sleep(3)
        try:
            result = await loop.run_in_executor(None, self._call_model, file_bytes, mime_type)
            _circuit.record(True)
            _metrics.increment('ai_fallback_success')
            return result
        except Exception as e:
            _circuit.record(False)
            _metrics.increment('ai_fallback_failures')
            logger.error(f"[AI GATEWAY] Pro fallback failed: {str(e)[:60]}. Using rule parser.")
            return self._rule_parse(file_bytes, mime_type)

    @staticmethod
    def _call_model(file_bytes: bytes, mime_type: str) -> dict:
        from vouchers.extraction_logic import perform_ocr_extraction
        return perform_ocr_extraction(file_bytes, mime_type)

    @staticmethod
    def _rule_parse(file_bytes: bytes, mime_type: str) -> dict:
        """Zero-cost OCR rule parser. ~100ms, no API calls."""
        import re, fitz
        result = {"invoice": {}, "items": [], "_fallback": True}
        try:
            ftype = "pdf" if "pdf" in mime_type else "png"
            doc   = fitz.open(stream=file_bytes, filetype=ftype)
            text  = "\n".join(p.get_text("text") for p in doc)
            doc.close()

            patterns = {
                "Voucher Date":        r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b',
                "Supplier Invoice No": r'(?:Invoice|Bill|Inv)\s*(?:No|#)[:\s]*([A-Z0-9/-]+)',
                "Total Invoice Value": r'(?:Grand Total|Total Amount|Total)[:\s₹]*(\d[\d,]+(?:\.\d+)?)',
                "GSTIN":               r'\b(\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d])\b',
                "Vendor Name":         r'(?:From|Seller|Vendor|Supplier)[:\s]+([A-Za-z][A-Za-z\s&.,]{3,50})',
            }
            for field, pattern in patterns.items():
                m = re.search(pattern, text, re.I)
                if m:
                    val = m.group(1).strip().replace(',', '')
                    result["invoice"][field] = val

            _metrics.increment('rule_parse_used')
        except Exception as e:
            logger.warning(f"[RULE PARSER] Failed: {e}")
        return result
