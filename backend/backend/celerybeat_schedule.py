"""
Celery Beat Periodic Task Schedule
=====================================
Self-healing tasks run on a schedule to recover stuck jobs.
Start Celery Beat alongside the worker:
  celery -A backend beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
"""
from celery.schedules import crontab

CELERYBEAT_SCHEDULE = {
    # Self-heal: re-queue stuck PROCESSING items every 5 minutes
    'recover-stuck-invoice-items': {
        'task': 'vouchers.tasks.recover_stuck_items',
        'schedule': 300.0,  # every 5 minutes
        'options': {'queue': 'invoice_files'},
    },
}
