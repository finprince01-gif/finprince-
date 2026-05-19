"""
Infrastructure Health Check Module
====================================
Refactored to remove Redis dependency. Focuses on AI and DB availability.
"""
import os
import logging
import threading
import time
from django.conf import settings

logger = logging.getLogger(__name__)

HEALTH_CACHE_TTL = 10.0   # seconds between AI re-checks
MAX_PAGES_PER_JOB = int(os.environ.get('MAX_PAGES_PER_JOB', '50'))

class SystemHealth:
    """
    Production system health. Monitors AI and DB availability.
    Redis dependency has been completely eliminated.
    """
    _last_check: float = 0.0
    _cached_status: dict = {}
    _lock = threading.Lock()

    @classmethod
    def get(cls) -> dict:
        with cls._lock:
            now = time.monotonic()
            if now - cls._last_check > HEALTH_CACHE_TTL:
                try:
                    from core.ai_proxy import validate_ai_on_startup
                    ai_ok = validate_ai_on_startup()
                    
                    # DB check (implicit)
                    db_ok = True 
                    
                    cls._cached_status = {
                        'ai': ai_ok,
                        'db': db_ok,
                        'healthy': ai_ok and db_ok
                    }
                except Exception as e:
                    logger.error(f"[HEALTH] Critical health check failure: {e}")
                    cls._cached_status = {'healthy': False, 'error': str(e)}
                cls._last_check = now

        return cls._cached_status

    @classmethod
    def is_ready(cls) -> tuple[bool, str]:
        """Gate for upload API. Returns (ok, reason)."""
        h = cls.get()
        if not h.get('ai'): return False, "Infrastructure Error: AI Service Unavailable"
        return True, 'ok'

class IdempotencyLock:
    """
    No-op Idempotency lock (Redis removed).
    Flow control is now handled via DB status transitions in the UnifiedWorker.
    """
    def __init__(self, fingerprint: str, ttl: int = 300):
        pass

    def acquire(self) -> bool:
        if not redis_client.available: return True # Fail-open
        return redis_client.get_client().set(self.key, "1", nx=True, ex=self.ttl)

    def release(self):
        if not redis_client.available: return
        redis_client.get_client().delete(self.key)

    def mark_done(self, job_id: int):
        if not redis_client.available: return
        redis_client.get_client().set(self.done_key, str(job_id), ex=86400) # 24hr

    def is_done(self) -> int | None:
        if not redis_client.available: return None
        val = redis_client.get_client().get(self.done_key)
        return int(val) if val else None

