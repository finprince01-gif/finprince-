"""
Celery Application Entry Point
Distributed task queue for invoice processing pipeline.
"""
import os
from celery import Celery
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

app = Celery('finpixe_bulk')

# Load config from Django settings (CELERY_* keys)
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks in all INSTALLED_APPS
app.autodiscover_tasks()

@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'[CELERY] Request: {self.request!r}')
