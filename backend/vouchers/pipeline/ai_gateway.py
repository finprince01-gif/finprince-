"""
AI Gateway – Simplified Direct-Call Version
============================================
Redis and Kafka removed.
State is kept in-process (single-server use case).

Components:
  - InProcessRateLimiter:  Thread-safe in-memory token bucket
  - InProcessCircuitBreaker: Simple in-memory circuit state
  - AIGateway.extract(): Direct Qwen/AI call with fallback to rule parser
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


# ── In-Process Rate Limiter ─────────────────────────────────────────────────
class InProcessRateLimiter:
    """Thread-safe token bucket. No external dependencies."""
    def __init__(self, max_rps: float):
        self._max = int(max_rps)
        self._semaphore = threading.Semaphore(self._max)

    def acquire(self) -> bool:
        acquired = self._semaphore.acquire(blocking=False)
        if acquired:
            self._semaphore.release()
        return acquired

    async def acquire_async(self, timeout: float = 30.0) -> bool:
        loop = asyncio.get_event_loop()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if await loop.run_in_executor(None, self.acquire):
                return True
            await asyncio.sleep(1.0 / max(self._max, 1))
        return False


# ── In-Process Circuit Breaker ──────────────────────────────────────────────
class InProcessCircuitBreaker:
    """Simple sliding-window circuit breaker using in-memory counters."""
    def __init__(self, fail_rate: float, window: int, min_calls: int):
        self._fail_rate  = fail_rate
        self._window     = window
        self._min_calls  = min_calls
        self._lock       = threading.Lock()
        self._ok_times: list[float]   = []
        self._fail_times: list[float] = []

    def _prune(self, lst: list[float], now: float) -> list[float]:
        return [t for t in lst if now - t < self._window]

    def record(self, success: bool):
        now = time.monotonic()
        with self._lock:
            if success:
                self._ok_times.append(now)
            else:
                self._fail_times.append(now)
            # Prune old entries
            self._ok_times   = self._prune(self._ok_times, now)
            self._fail_times = self._prune(self._fail_times, now)

    @property
    def is_open(self) -> bool:
        now = time.monotonic()
        with self._lock:
            ok   = len(self._prune(self._ok_times, now))
            fail = len(self._prune(self._fail_times, now))
            total = ok + fail
            if total < self._min_calls:
                return False
            rate = fail / total
            if rate > self._fail_rate:
                logger.warning(f"[CIRCUIT] OPEN – fail rate {rate:.1%}")
                return True
        return False


# ── In-Process Result Cache ─────────────────────────────────────────────────
class InProcessResultCache:
    """Simple in-memory TTL cache. No external dependencies."""
    def __init__(self, ttl: int = 86400):
        self._ttl   = ttl
        self._store: dict[str, tuple[dict, float]] = {}
        self._lock  = threading.Lock()

    def get(self, page_hash: str, tenant_id: str):
        key = f"{tenant_id}:{page_hash}"
        with self._lock:
            entry = self._store.get(key)
            if entry and time.monotonic() - entry[1] < self._ttl:
                return entry[0]
            self._store.pop(key, None)
        return None

    def set(self, page_hash: str, tenant_id: str, result: dict):
        key = f"{tenant_id}:{page_hash}"
        with self._lock:
            self._store[key] = (result, time.monotonic())


# ── Metrics (In-Process) ────────────────────────────────────────────────────
class GatewayMetrics:
    """Simple in-memory counters."""
    def __init__(self):
        self._lock   = threading.Lock()
        self._counts: dict[str, int] = {}

    def increment(self, field: str):
        with self._lock:
            self._counts[field] = self._counts.get(field, 0) + 1

    def get_all(self) -> dict:
        with self._lock:
            return dict(self._counts)


# ── Public API ───────────────────────────────────────────────────────────────
_rate_limiter = InProcessRateLimiter(MAX_RPS)
_circuit      = InProcessCircuitBreaker(CIRCUIT_FAIL_RATE, CIRCUIT_WINDOW, CIRCUIT_MIN_CALLS)
_cache        = InProcessResultCache(CACHE_TTL)
_metrics      = GatewayMetrics()


class AIGateway:
    """
    Direct-call AI Gateway. No Redis. No Kafka.
    """

    async def extract(
        self,
        file_bytes: bytes,
        mime_type: str,
        page_hash: str,
        tenant_id: str,
        **kwargs
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
            return self._rule_parse(file_bytes, mime_type,
                                    pre_extracted_text=kwargs.get('pre_extracted_text'))

        # 3. Rate limit
        acquired = await _rate_limiter.acquire_async(timeout=30.0)
        if not acquired:
            _metrics.increment('rate_limit_fallbacks')
            logger.warning("[AI GATEWAY] Rate limit timeout. Using rule parser.")
            return self._rule_parse(file_bytes, mime_type,
                                    pre_extracted_text=kwargs.get('pre_extracted_text'))

        # 4. AI call
        result = await self._call_ai_with_fallback(
            file_bytes,
            mime_type,
            pre_extracted_text=kwargs.get('pre_extracted_text'),
            hint_data=kwargs.get('hint_data')
        )

        # 5. Cache + metrics
        if not result.get('_fallback'):
            _cache.set(page_hash, tenant_id, result)

        _metrics.increment('ai_success')
        return result

    async def _call_ai_with_fallback(self, file_bytes: bytes, mime_type: str,
                                      pre_extracted_text: str = None, hint_data=None) -> dict:
        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(
                None, self._call_model, file_bytes, mime_type, pre_extracted_text, hint_data
            )
            _circuit.record(True)
            return result
        except Exception as e:
            _circuit.record(False)
            _metrics.increment('ai_failures')
            logger.error(f"[AI GATEWAY] AI call failed: {e}. Falling back to rule parser.")
            return self._rule_parse(file_bytes, mime_type, pre_extracted_text=pre_extracted_text)

    @staticmethod
    def _call_model(file_bytes: bytes, mime_type: str, pre_extracted_text: str = None,
                    hint_data=None) -> dict:
        from vouchers.extraction_logic import perform_ocr_extraction
        return perform_ocr_extraction(file_bytes, mime_type,
                                      pre_extracted_text=pre_extracted_text,
                                      hint_data=hint_data)

    @staticmethod
    def _rule_parse(file_bytes: bytes, mime_type: str, pre_extracted_text: str = None) -> dict:
        from core.rule_parser import rule_parse_invoice
        return rule_parse_invoice(file_bytes, mime_type, pre_extracted_text=pre_extracted_text)
