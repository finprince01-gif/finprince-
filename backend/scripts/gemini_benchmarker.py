import os
import django
import sys
import time
import asyncio
import random
import statistics
import json

# Setup Django
sys.path.append(os.path.join(os.getcwd(), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.extraction import gemini_concurrency_gate
from core.ai_proxy import ai_service

from concurrent.futures import ThreadPoolExecutor

def _sync_ai_call(tenant_id):
    """Sync wrapper for the governed AI call."""
    with gemini_concurrency_gate(tenant_id, max_wait=10):
        # Mock the AI call
        time.sleep(random.uniform(1.0, 3.0))
        return True

async def simulate_ai_call(tenant_id, call_id):
    """Simulates a governed AI call (Async executor version)."""
    t0 = time.perf_counter()
    status = "SUCCESS"
    wait_time = 0
    
    try:
        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor() as pool:
            await loop.run_in_executor(pool, _sync_ai_call, tenant_id)
            wait_time = time.perf_counter() - t0
    except Exception as e:
        if "timeout" in str(e).lower() or "quota" in str(e).lower():
            status = "THROTTLED"
        else:
            print(f"Error: {e}")
            status = "ERROR"
            
    return {
        "call_id": call_id,
        "status": status,
        "wait_time": wait_time,
        "total_time": time.perf_counter() - t0
    }

async def run_gemini_benchmark(concurrency=20, tenants=3):
    """
    PHASE 6C: GEMINI THROUGHPUT LIMITS.
    Measures the effectiveness of the Token Bucket governance.
    """
    print(f"\n[GEMINI_BENCHMARK] Concurrency: {concurrency} | Tenants: {tenants}")
    print(f"{'-'*60}")
    
    tenant_ids = [f"bench_tenant_{i}" for i in range(tenants)]
    tasks = []
    
    for i in range(concurrency):
        tid = random.choice(tenant_ids)
        tasks.append(simulate_ai_call(tid, i))
        
    t_start = time.perf_counter()
    results = await asyncio.gather(*tasks)
    t_total = time.perf_counter() - t_start
    
    # Analysis
    successes = [r for r in results if r["status"] == "SUCCESS"]
    throttled = [r for r in results if r["status"] == "THROTTLED"]
    wait_times = [r["wait_time"] for r in results if r["status"] == "SUCCESS"]
    
    print(f"\n[RESULTS]")
    print(f"Total Calls:      {len(results)}")
    print(f"Successes:        {len(successes)}")
    print(f"Throttled:        {len(throttled)}")
    if wait_times:
        print(f"Avg Queue Wait:   {statistics.mean(wait_times)*1000:.2f}ms")
        print(f"P95 Queue Wait:   {statistics.quantiles(wait_times, n=20)[18]*1000:.2f}ms")
    print(f"Throughput:       {len(successes)/t_total:.2f} calls/sec")
    
    return results

if __name__ == "__main__":
    # Test high burst (50 concurrent calls for 3 tenants)
    asyncio.run(run_gemini_benchmark(concurrency=50, tenants=3))
