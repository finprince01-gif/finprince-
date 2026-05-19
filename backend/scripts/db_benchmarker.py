import os
import django
import sys
import time
import asyncio
import random
import statistics
import uuid

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult
from django.db import transaction, connection

from concurrent.futures import ThreadPoolExecutor

def simulate_session_lock(session_id, concurrency_id):
    """Simulates a worker trying to acquire an assembly lock (Sync version)."""
    t0 = time.perf_counter()
    acquired = False
    wait_time = 0
    
    try:
        with transaction.atomic():
            start_lock = time.perf_counter()
            try:
                # Use nowait=True to measure collision rate
                _ = SessionFinalizationState.objects.select_for_update(nowait=True).get_or_create(id=session_id)
                acquired = True
                wait_time = time.perf_counter() - start_lock
                time.sleep(0.1) 
            except Exception:
                acquired = False
                wait_time = time.perf_counter() - start_lock
    except Exception as e:
        pass
        
    return {
        "concurrency_id": concurrency_id,
        "acquired": acquired,
        "wait_time": wait_time,
        "total_time": time.perf_counter() - t0
    }

def run_db_benchmark(concurrency=20, sessions=5):
    """
    PHASE 6D: DATABASE STRESS VALIDATION.
    Measures lock contention and transaction throughput.
    """
    print(f"\n[DB_BENCHMARK] Concurrency: {concurrency} | Target Sessions: {sessions}")
    print(f"{'-'*60}")
    
    session_ids = [f"bench_session_{i}" for i in range(sessions)]
    
    t_start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(simulate_session_lock, random.choice(session_ids), i) for i in range(concurrency)]
        results = [f.result() for f in futures]
    
    t_total = time.perf_counter() - t_start
    
    # Analysis
    acquisitions = [r for r in results if r["acquired"]]
    collisions = [r for r in results if not r["acquired"]]
    wait_times = [r["wait_time"] for r in results]
    
    print(f"\n[RESULTS]")
    print(f"Total Transactions: {len(results)}")
    print(f"Success Rate:       {len(acquisitions)/len(results)*100:.1f}%")
    print(f"Collisions:         {len(collisions)}")
    print(f"Avg Wait Time:      {statistics.mean(wait_times)*1000:.2f}ms")
    print(f"Total Duration:     {t_total:.2f}s")
    
    # Cleanup
    SessionFinalizationState.objects.filter(id__startswith='bench_session').delete()
    
    return results

if __name__ == "__main__":
    run_db_benchmark(concurrency=50, sessions=5)
