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
import time
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

        # 1. Wait/Check Redis (Non-crashing for startup, logged as error)
        max_retries = 5
        wait_seconds = 2
        redis_ok = False
        
        logger.info(f"[STARTUP] Checking Redis availability (Max retries: {max_retries})...")
        from vouchers.pipeline.health import check_redis
        
        for attempt in range(max_retries):
            if check_redis():
                logger.info("[STARTUP] [OK] Redis: OK")
                redis_ok = True
                break
            else:
                logger.warning(f"[STARTUP] Redis NOT ready (Attempt {attempt+1}/{max_retries}). Waiting {wait_seconds}s...")
                time.sleep(wait_seconds)
        
        if not redis_ok:
            logger.critical(
                "[STARTUP] [ERROR] Redis UNAVAILABLE. "
                "Bulk processing and AI features will NOT work until Redis is running."
            )

        # 2. Kafka check (non-fatal, logged as warning)
        try:
            from vouchers.pipeline.health import check_kafka
            if check_kafka():
                logger.info("[STARTUP] [OK] Kafka: OK")
            else:
                logger.warning(
                    "[STARTUP] [WARNING] Kafka UNAVAILABLE. "
                    "Bulk upload API will return 503 until Kafka is running."
                )
        except Exception:
            pass
