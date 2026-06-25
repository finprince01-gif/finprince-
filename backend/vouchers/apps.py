"""
Vouchers Django App Config
============================
Runs startup infrastructure checks at server boot.
"""
import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class VouchersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'vouchers'

    def ready(self):
        """Called once when Django starts."""
        self._check_infrastructure()

    @staticmethod
    def _check_infrastructure():
        import sys
        running_server = any(
            cmd in sys.argv for cmd in ('runserver', 'gunicorn', 'uvicorn')
        )
        if not running_server:
            return

        from core.ai_proxy import validate_ai_on_startup
        try:
            ok = validate_ai_on_startup()
            if ok:
                logger.info("[STARTUP] [OK] AI Model Connection: SUCCESS")
            else:
                logger.warning("[STARTUP] [WARNING] AI Model is not available. Check QWEN_API_KEY and QWEN_API_BASE.")
        except Exception as e:
            logger.error(f"[STARTUP] AI check error: {e}")
