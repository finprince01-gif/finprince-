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
import multiprocessing
import signal
import random
import uuid
from datetime import datetime

# Setup Django environment
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from core.redis_client import redis_client
from core.ai_proxy import process_ai_request, rate_limiter
from django.conf import settings

logger = logging.getLogger("AIWorker")
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')

QUEUE_NAME = "ai_requests"
MAX_RETRIES = 5

def ai_worker_process(worker_id):
    logger.info(f"Worker {worker_id} started. Listening on {QUEUE_NAME}...")
    
    MAX_RPS = getattr(settings, 'AI_MAX_RPS', 5)

    while True:
        try:
            # 1. Pop task from Redis
            task, _ = redis_client.pop_from_queue(QUEUE_NAME, timeout=5)
            if not task:
                continue

            request_id = task['id']
            request_data = task['request_data']
            
            # 2. COORDINATED PACING (Global Token Bucket)
            # All workers pull from the same bucket to ensure steady flow
            while not redis_client.acquire_token("global_ai_pace", MAX_RPS, MAX_RPS):
                time.sleep(0.1)

            # 3. WORKER JITTER (50-150ms)
            # Prevents "thundering herd" if multiple workers wake up at same time
            time.sleep(random.uniform(0.05, 0.15))

            logger.info(f"Worker {worker_id} | Processing task {request_id}")
            t_start = time.time()
            
            # 4. Process Request
            result = process_ai_request(request_data)
            
            # 5. Handle 429 / Rate Limits with EXPONENTIAL BACKOFF
            is_429 = result.get('code') == 'RATE_LIMIT' or '429' in str(result.get('error', ''))
            
            if is_429:
                retries = task.get('retries', 0)
                if retries < 3:
                    task['retries'] = retries + 1
                    # Exponential Backoff: 2s, 4s, 8s
                    backoff = 2 ** task['retries']
                    logger.warning(f"Worker {worker_id} | 429 detected. Backoff {backoff}s | Attempt {task['retries']}")
                    time.sleep(backoff)
                    redis_client.push_to_queue(QUEUE_NAME, task)
                    continue
                else:
                    logger.error(f"Worker {worker_id} | Task {request_id} failed after 3 retries.")
            
            # 6. Save Result to Redis
            result_key = f"ai_result:{request_id}"
            redis_client.get_client().setex(result_key, 600, json.dumps(result))
            
            # 7. Record Metrics
            latency = time.time() - t_start
            redis_client.record_metric("ai_latency", latency)
            if not is_429:
                redis_client.record_metric("ai_success_count", 1)
            else:
                redis_client.record_metric("ai_429_count", 1)
                
            logger.info(f"Worker {worker_id} | Completed task {request_id} in {latency:.2f}s")

        except Exception as e:
            logger.error(f"Worker {worker_id} | Unexpected error: {e}")
            time.sleep(1)

def run_workers(num_workers=4):
    processes = []
    for i in range(num_workers):
        p = multiprocessing.Process(target=ai_worker_process, args=(i,))
        p.start()
        processes.append(p)
    
    def signal_handler(sig, frame):
        logger.info("Stopping workers...")
        for p in processes:
            p.terminate()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    for p in processes:
        p.join()

if __name__ == "__main__":
    workers = int(os.getenv('AI_WORKERS', '4'))
    run_workers(num_workers=workers)
