"""
Infrastructure Health Check Module
====================================
Restored Redis-backed health monitoring for production scalability.
"""
import os
import logging
import threading
import time
from django.conf import settings
from core.redis_client import redis_client

logger = logging.getLogger(__name__)

HEALTH_CACHE_TTL = 10.0   # seconds between AI re-checks
MAX_PAGES_PER_JOB = int(os.environ.get('MAX_PAGES_PER_JOB', '50'))

class SystemHealth:
    """
    Production system health. Monitors Redis, Workers, and AI availability.
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
                    redis_ok = redis_client.is_healthy()
                    
                    # Check for active workers (heartbeat check)
                    workers_active = redis_client.verify_consumer_active(max_age=120)
                    
                    # Check for queue backpressure
                    total_q = redis_client.get_queue_length(['ingestion_queue', 'ocr_queue', 'ai_requests'])
                    overloaded = total_q > 5000

                    cls._cached_status = {
                        'ai': ai_ok,
                        'redis': redis_ok,
                        'workers': workers_active,
                        'overloaded': overloaded,
                        'queue_depth': total_q,
                        'healthy': ai_ok and redis_ok and workers_active and not overloaded
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
        if not h.get('redis'): return False, "Infrastructure Error: Redis Offline"
        if not h.get('workers'): return False, "Infrastructure Error: No Active Workers"
        if h.get('overloaded'): return False, "System Busy: High Queue Depth"
        return True, 'ok'

class IdempotencyLock:
    """
    Redis-backed distributed idempotency lock.
    """
    def __init__(self, fingerprint: str, ttl: int = 300):
        self.key = f"lock:idempotency:{fingerprint}"
        self.done_key = f"done:idempotency:{fingerprint}"
        self.ttl = ttl

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

