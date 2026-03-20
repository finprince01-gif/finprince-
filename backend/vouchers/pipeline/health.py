"""
Infrastructure Health Check Module – Final Hardened Version
=============================================================
System operating modes:
  NORMAL   – Redis ✅ Kafka ✅  → full pipeline
  DEGRADED – Redis ✅ Kafka ❌  → reject uploads (pipeline is offline)
  SAFE     – Redis ❌ Kafka ✅  → AI disabled, OCR rule-parse only
  DOWN     – Redis ❌ Kafka ❌  → all bulk operations blocked

Hard rules:
  - AI is DISABLED when Redis is down (no rate-limit enforcement → no AI)
  - Kafka lag > UPLOAD_LAG_LIMIT rejects new uploads
  - Retry storm (retry topic lag > RETRY_LAG_LIMIT) throttles retries
  - System never falls back to direct processing
"""
import os
import logging
import threading
import time

logger = logging.getLogger(__name__)

# Thresholds
UPLOAD_LAG_LIMIT = int(os.environ.get('KAFKA_LAG_LIMIT', '20000'))
RETRY_LAG_LIMIT  = int(os.environ.get('KAFKA_RETRY_LAG_LIMIT', '10000'))
HEALTH_CACHE_TTL = 10.0   # seconds between infra re-checks
MAX_PAGES_PER_JOB = int(os.environ.get('MAX_PAGES_PER_JOB', '50'))


# ─────────────────────────────────────────────────────────────
# REDIS CHECK
# ─────────────────────────────────────────────────────────────
def check_redis(raise_on_failure: bool = False) -> bool:
    try:
        import redis as redis_lib
        r = redis_lib.from_url(
            os.environ.get('REDIS_URL', 'redis://localhost:6379/0'),
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        r.ping()
        return True
    except Exception as e:
        logger.critical(f"[HEALTH] Redis UNAVAILABLE: {e}")
        if raise_on_failure:
            raise RuntimeError(f"[HEALTH] Redis required but unavailable: {e}")
        return False


# ─────────────────────────────────────────────────────────────
# KAFKA CHECK
# ─────────────────────────────────────────────────────────────
def check_kafka(raise_on_failure: bool = False) -> bool:
    bootstrap = os.environ.get('KAFKA_BOOTSTRAP', 'localhost:9092')
    try:
        from aiokafka.admin import AIOKafkaAdminClient
        import asyncio

        async def _ping():
            client = AIOKafkaAdminClient(bootstrap_servers=bootstrap)
            await client.start()
            await client.close()

        loop = asyncio.new_event_loop()
        loop.run_until_complete(asyncio.wait_for(_ping(), timeout=3.0))
        loop.close()
        return True
    except Exception as e:
        logger.critical(f"[HEALTH] Kafka UNAVAILABLE ({bootstrap}): {e}")
        if raise_on_failure:
            raise RuntimeError(f"[HEALTH] Kafka required but unavailable: {e}")
        return False


def get_kafka_lag(topic_key: str, group_id: str) -> int:
    """Non-blocking Kafka consumer lag check. Returns 0 on failure."""
    try:
        from kafka import KafkaConsumer
        from kafka.structs import TopicPartition
        from vouchers.pipeline.kafka_client import TOPICS
        bootstrap = os.environ.get('KAFKA_BOOTSTRAP', 'localhost:9092')
        topic = TOPICS.get(topic_key, topic_key)
        consumer = KafkaConsumer(bootstrap_servers=bootstrap, group_id=f'{group_id}-probe')
        partitions = consumer.partitions_for_topic(topic) or []
        tps = [TopicPartition(topic, p) for p in partitions]
        end = consumer.end_offsets(tps)
        committed = {tp: (consumer.committed(tp) or 0) for tp in tps}
        lag = sum(end[tp] - committed[tp] for tp in tps)
        consumer.close()
        return lag
    except Exception:
        return 0


# ─────────────────────────────────────────────────────────────
# SYSTEM HEALTH + OPERATING MODE
# ─────────────────────────────────────────────────────────────
class SystemHealth:
    """
    Cached system health with operating mode.
    TTL-based re-check avoids hammering infra on every request.
    """
    _redis_ok: bool = False
    _kafka_ok: bool = False
    _last_check: float = 0.0
    _lock = threading.Lock()

    # --------------- mode helpers ---------------
    @classmethod
    def get(cls) -> dict:
        with cls._lock:
            now = time.monotonic()
            if now - cls._last_check > HEALTH_CACHE_TTL:
                cls._redis_ok = check_redis()
                cls._kafka_ok = check_kafka()
                cls._last_check = now

        mode = cls._compute_mode(cls._redis_ok, cls._kafka_ok)
        return {
            'redis': cls._redis_ok,
            'kafka': cls._kafka_ok,
            'mode':  mode,
            'healthy': mode == 'NORMAL',
            'ai_enabled': cls._redis_ok,   # AI disabled if Redis is down
        }

    @staticmethod
    def _compute_mode(redis_ok: bool, kafka_ok: bool) -> str:
        if redis_ok and kafka_ok:   return 'NORMAL'
        if redis_ok and not kafka_ok: return 'DEGRADED'   # uploads offline
        if not redis_ok and kafka_ok: return 'SAFE'       # AI disabled
        return 'DOWN'

    @classmethod
    def is_ready(cls) -> tuple[bool, str]:
        """Returns (ok, reason). Gate for upload API."""
        h = cls.get()
        if h['mode'] == 'NORMAL':   return True, 'ok'
        if h['mode'] == 'DEGRADED': return False, 'Kafka unavailable – upload pipeline offline'
        if h['mode'] == 'SAFE':     return False, 'Redis unavailable – pipeline cannot run safely'
        return False, 'System DOWN – Redis and Kafka both unavailable'

    @classmethod
    def is_ai_enabled(cls) -> bool:
        return cls.get()['ai_enabled']

    @classmethod
    def check_upload_lag(cls) -> tuple[bool, int]:
        """
        Returns (lag_ok, lag_value).
        Rejects uploads when upload topic is too backed up.
        """
        lag = get_kafka_lag('upload', 'ocr-workers')
        return lag <= UPLOAD_LAG_LIMIT, lag

    @classmethod
    def check_retry_storm(cls) -> tuple[bool, int]:
        """
        Returns (storm_detected, lag_value).
        True = retry topic is overwhelmed.
        """
        lag = get_kafka_lag('retry', 'retry-workers')
        return lag > RETRY_LAG_LIMIT, lag

    @classmethod
    def invalidate(cls):
        """Force re-check on next call."""
        with cls._lock:
            cls._last_check = 0.0


# ─────────────────────────────────────────────────────────────
# PAGE IDEMPOTENCY GUARD (DB-level duplicate protection)
# ─────────────────────────────────────────────────────────────
def is_page_already_processed(job_id: int, parent_item_id: int, page_number: int) -> bool:
    """
    Checks DB for existing success/partial record for this exact page.
    Protects against Kafka at-least-once duplicate delivery.
    """
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
        return False  # Fail open on DB error (worker will handle duplicates via DB constraint)


# ─────────────────────────────────────────────────────────────
# IDEMPOTENCY LOCK (distributed Redis lock)
# ─────────────────────────────────────────────────────────────
class IdempotencyLock:
    PREFIX = "idempotency_lock"

    def __init__(self, fingerprint: str, ttl: int = 300):
        self._key = f"{self.PREFIX}:{fingerprint}"
        self._ttl = ttl
        self._redis = None

    def _r(self):
        if self._redis is None:
            import redis as redis_lib
            self._redis = redis_lib.from_url(
                os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
            )
        return self._redis

    def acquire(self) -> bool:
        try:
            return bool(self._r().set(self._key, '1', nx=True, ex=self._ttl))
        except Exception as e:
            logger.warning(f"[IDEMPOTENCY] Redis lock acquire failed: {e}. Allowing (DB is backup).")
            return True

    def release(self):
        try:
            self._r().delete(self._key)
        except Exception as e:
            logger.warning(f"[IDEMPOTENCY] Redis lock release failed: {e}")

    def mark_done(self, job_id: int):
        try:
            self._r().setex(f"done:{self._key}", 86400, str(job_id))
        except Exception:
            pass

    def is_done(self) -> int | None:
        try:
            val = self._r().get(f"done:{self._key}")
            return int(val) if val else None
        except Exception:
            return None
