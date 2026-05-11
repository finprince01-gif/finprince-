import os
import time
import logging
import django
from django.utils import timezone
from datetime import timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from core.redis_client import redis_client

logger = logging.getLogger("Janitor")

def cleanup_stale_jobs():
    """Finds jobs stuck in processing/pending for too long."""
    stale_threshold = timezone.now() - timedelta(minutes=30)
    stale_jobs = BulkInvoiceJob.objects.filter(
        status__in=['pending', 'processing'],
        updated_at__lt=stale_threshold
    )
    
    count = stale_jobs.count()
    if count > 0:
        logger.warning(f"[JANITOR] Found {count} stale jobs. Mark as FAILED.")
        for job in stale_jobs:
            logger.info(f"[JANITOR] Cleaning up Job {job.id} (Tenant: {job.tenant_id})")
            job.status = 'failed'
            job.error_message = "Job timed out in pipeline (Janitor cleanup)"
            job.save()
            
            # Release Redis quota if orphan
            redis_client.decr_tenant_concurrency(job.tenant_id)
            
            # Also fail the items
            job.items.filter(status__in=['pending', 'processing']).update(
                status='failed', 
                error_message="Stale job cleanup"
            )

def cleanup_orphan_locks():
    """Ensures Redis concurrency counters don't stay high if DB is terminal."""
    # This is a bit more complex as we need to iterate over all tenants in Redis
    # For now, we rely on the TTL of the Redis keys (3600s set in incr_tenant_concurrency)
    pass

def cleanup_temp_files():
    """Removes old files from temp_ingestion."""
    from django.conf import settings
    temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp_ingestion')
    if not os.path.exists(temp_dir):
        return
        
    now = time.time()
    for root, dirs, files in os.walk(temp_dir):
        for name in files:
            file_path = os.path.join(root, name)
            if os.path.getmtime(file_path) < now - (24 * 3600):
                try:
                    os.remove(file_path)
                    logger.info(f"[JANITOR] Removed old temp file: {file_path}")
                except:
                    pass
        # Remove empty dirs
        for name in dirs:
            dir_path = os.path.join(root, name)
            if not os.listdir(dir_path) and os.path.getmtime(dir_path) < now - (24 * 3600):
                try:
                    os.rmdir(dir_path)
                    logger.info(f"[JANITOR] Removed empty temp dir: {dir_path}")
                except:
                    pass

def run_janitor():
    logger.info("--- JANITOR CYCLE STARTED ---")
    try:
        cleanup_stale_jobs()
        cleanup_temp_files()
    except Exception as e:
        logger.error(f"[JANITOR] Error during cycle: {e}")
    logger.info("--- JANITOR CYCLE COMPLETE ---")

if __name__ == "__main__":
    run_janitor()
