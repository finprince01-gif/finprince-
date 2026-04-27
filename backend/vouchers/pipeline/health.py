"""
Infrastructure Health Check Module
====================================
Simplified: Redis and Kafka removed.
System is always considered ready as long as the AI model is reachable.
"""
import os
import logging
import threading
import time

logger = logging.getLogger(__name__)

HEALTH_CACHE_TTL = 30.0   # seconds between AI re-checks
MAX_PAGES_PER_JOB = int(os.environ.get('MAX_PAGES_PER_JOB', '10000'))


# ─────────────────────────────────────────────────────────────
# SYSTEM HEALTH + OPERATING MODE
# ─────────────────────────────────────────────────────────────
class SystemHealth:
    """
    Lightweight system health. Only checks AI availability.
    """
    _ai_ok: bool = False
    _last_check: float = 0.0
    _lock = threading.Lock()

    @classmethod
    def get(cls) -> dict:
        with cls._lock:
            now = time.monotonic()
            if now - cls._last_check > HEALTH_CACHE_TTL:
                try:
                    from core.ai_proxy import validate_ai_on_startup
                    cls._ai_ok = validate_ai_on_startup()
                except Exception as e:
                    logger.error(f"[HEALTH] AI validation error: {e}")
                    cls._ai_ok = False
                cls._last_check = now

        return {
            'ai':         cls._ai_ok,
            'mode':       'NORMAL' if cls._ai_ok else 'AI_FAILED',
            'healthy':    cls._ai_ok,
            'ai_enabled': cls._ai_ok,
        }

    @classmethod
    def is_ready(cls) -> tuple[bool, str]:
        """Returns (ok, reason). Gate for upload API. Resilience: Always OK if key exists."""
        h = cls.get()
        if not h['ai']:
            # Log but don't hard-block with 503. The downstream worker will handle AI errors.
            logger.warning("[HEALTH] AI reported as offline, but proceeding with upload as failback exists.")
        return True, 'ok'

    @classmethod
    def is_ai_enabled(cls) -> bool:
        return cls.get()['ai_enabled']

    @classmethod
    def check_upload_lag(cls) -> tuple[bool, int]:
        """Always OK – Kafka removed."""
        return True, 0

    @classmethod
    def check_retry_storm(cls) -> tuple[bool, int]:
        """Always OK – Kafka removed."""
        return False, 0

    @classmethod
    def invalidate(cls):
        """Force re-check on next call."""
        with cls._lock:
            cls._last_check = 0.0


# ─────────────────────────────────────────────────────────────
# PAGE IDEMPOTENCY GUARD (DB-level duplicate protection)
# ─────────────────────────────────────────────────────────────
def is_page_already_processed(job_id: int, parent_item_id: int, page_number: int) -> bool:
    try:
        from vouchers.models import InvoiceProcessingItem
        return InvoiceProcessingItem.objects.filter(
            job_id=job_id,
            parent_item_id=parent_item_id,
            page_number=page_number,
            status__in=['success', 'partial', 'skipped']
        ).exists()
    except Exception as e:
        logger.warning(f"[IDEMPOTENCY] Page check failed: {e}")
        return False


# ─────────────────────────────────────────────────────────────
# IDEMPOTENCY LOCK (DB-backed, no Redis dependency)
# ─────────────────────────────────────────────────────────────
class IdempotencyLock:
    """
    No-op idempotency lock. Redis removed.
    DB-level duplicate checks (BulkInvoiceJob.file_hash) handle idempotency.
    """
    def __init__(self, fingerprint: str, ttl: int = 300):
        self._fingerprint = fingerprint

    def acquire(self) -> bool:
        return True

    def release(self):
        pass

    def mark_done(self, job_id: int):
        pass

    def is_done(self) -> int | None:
        return None
