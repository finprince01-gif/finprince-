import os
import sys
import time

print("\n" + "!"*80)
print("CRITICAL: THIS WORKER IS OBSOLETE AND HAS BEEN DECOMMISSIONED.")
print("USE 'python vouchers/worker.py' INSTEAD.")
print("!"*80 + "\n")
sys.exit(1)

import json
import logging
import signal

# Setup Django environment
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from core.redis_client import redis_client
from vouchers.pipeline.direct_processor import process_bulk_job
from vouchers.models import BulkInvoiceJob

logger = logging.getLogger("BulkJobWorker")
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')

PRIORITY_QUEUES = ["bulk_jobs_high", "bulk_jobs_normal", "bulk_jobs_low"]
WORKER_ID = f"worker:{os.getpid()}"

def run_worker():
    logger.info(f"Bulk Job Worker {WORKER_ID} started. Listening on {PRIORITY_QUEUES}...")
    
    while True:
        try:
            # 0. Worker Heartbeat
            redis_client.get_client().hset("worker_heartbeats", WORKER_ID, time.time())
            
            # 1. Pop task from Redis Priority Queues (high -> normal -> low)
            task, q_name = redis_client.pop_from_queue(PRIORITY_QUEUES, timeout=5)
            if not task:
                continue

            job_id = task['job_id']
            voucher_type = task.get('voucher_type', 'Purchase')
            
            # 2. IDEMPOTENCY / DEDUPLICATION
            # Prevent multiple workers from picking up the same job
            lock_key = f"lock:job:{job_id}"
            if not redis_client.get_client().setnx(lock_key, WORKER_ID):
                logger.warning(f"Job {job_id} is already being processed by another worker. Skipping.")
                continue
            redis_client.get_client().expire(lock_key, 3600) # 1 hour lock

            logger.info(f"Processing Bulk Job {job_id} from {q_name} | Type: {voucher_type}")
            
            # 3. Add to "processing" set for failure safety
            redis_client.get_client().sadd("bulk_jobs:processing", job_id)
            
            t_start = time.time()
            
            # 4. Process Job
            try:
                process_bulk_job(job_id, voucher_type)
                latency = time.time() - t_start
                redis_client.record_metric("bulk_job_latency", latency)
                redis_client.record_metric("bulk_job_success_count", 1)
                logger.info(f"Finished Bulk Job {job_id} in {latency:.2f}s")
            except Exception as e:
                logger.error(f"Error processing job {job_id}: {e}")
                redis_client.record_metric("bulk_job_failure_count", 1)
                BulkInvoiceJob.objects.filter(id=job_id).update(status='failed')
            
            # 5. Cleanup
            redis_client.get_client().srem("bulk_jobs:processing", job_id)
            redis_client.get_client().delete(lock_key)

        except Exception as e:
            logger.error(f"Unexpected error in worker loop: {e}")
            time.sleep(1)

if __name__ == "__main__":
    def signal_handler(sig, frame):
        logger.info("Stopping Bulk Job Worker...")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    run_worker()
