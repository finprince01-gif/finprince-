import os
from django.apps import AppConfig

class OcrPipelineConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ocr_pipeline'

    def ready(self):
        # Only start in the main process (avoid starting twice in dev with reloader)
        if os.environ.get('RUN_MAIN') == 'true' or os.environ.get('WEBSERVER_MONITOR') == 'true':
            try:
                from core.alert_manager import alert_manager
                alert_manager.start()
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to start AlertManager: {e}")
