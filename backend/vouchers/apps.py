"""
Vouchers Django App Config
============================
Runs startup infrastructure checks at server boot.

HARD RULES:
  - Redis must be reachable or the server WILL NOT START (in production).
  - In development (DEBUG=True), Redis failure is logged as CRITICAL but
    does not crash the server, so developers can still work on non-bulk features.
"""
import os
import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class VouchersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'vouchers'

    def ready(self):
        """Called once when Django starts. Gate infrastructure checks here."""
        self._check_infrastructure()

    @staticmethod
    def _check_infrastructure():
        # Avoid running checks during migrations, tests, or shell commands
        # (only enforce on real server startup)
        import sys
        running_server = any(
            cmd in sys.argv for cmd in ('runserver', 'gunicorn', 'uvicorn')
        )
        if not running_server:
            return

        from django.conf import settings
        is_prod = not settings.DEBUG

        logger.info("[STARTUP] Checking infrastructure dependencies...")

        # Redis check
        try:
            from vouchers.pipeline.health import check_redis
            if check_redis():
                logger.info("[STARTUP] ✅ Redis: OK")
            else:
                if is_prod:
                    raise RuntimeError(
                        "[STARTUP] ❌ Redis is DOWN. Cannot start in production. "
                        "Set REDIS_URL and ensure Redis is running."
                    )
                else:
                    logger.critical(
                        "[STARTUP] ❌ Redis UNAVAILABLE. "
                        "Bulk processing pipeline will NOT work until Redis is running. "
                        "Set REDIS_URL=redis://localhost:6379/0 and start Redis."
                    )
        except RuntimeError:
            raise
        except Exception as e:
            logger.critical(f"[STARTUP] Redis check exception: {e}")
            if is_prod:
                raise

        # Kafka check (non-fatal at startup — workers start separately)
        try:
            from vouchers.pipeline.health import check_kafka
            if check_kafka():
                logger.info("[STARTUP] ✅ Kafka: OK")
            else:
                logger.warning(
                    "[STARTUP] ⚠️  Kafka UNAVAILABLE. "
                    "Bulk upload API will return 503 until Kafka is running. "
                    "Set KAFKA_BOOTSTRAP=localhost:9092"
                )
        except Exception:
            pass
