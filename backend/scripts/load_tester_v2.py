import asyncio
import httpx
import time
import uuid
import os
import statistics
import argparse
from typing import List, Dict, Any

# Configuration
API_BASE = "http://localhost:8000/api"
UPLOAD_URL = f"{API_BASE}/bulk-upload/"
STATUS_URL = f"{API_BASE}/bulk-status/"
TEST_FILE = "backend/tests/test.pdf"

class LoadTester:
    def __init__(self, concurrency: int, total_requests: int, chaos_hook: str = None):
        self.concurrency = concurrency
        self.total_requests = total_requests
        self.chaos_hook = chaos_hook
        self.results = []
        self.semaphore = asyncio.Semaphore(concurrency)

    async def simulate_user(self, client: httpx.AsyncClient, user_id: int):
        async with self.semaphore:
            t_start = time.perf_counter()
            session_id = f"load-test-{uuid.uuid4().hex[:8]}"
            
            try:
                # 1. Upload
                with open(TEST_FILE, "rb") as f:
                    files = {"files": (os.path.basename(TEST_FILE), f, "application/pdf")}
                    data = {
                        "upload_session_id": session_id,
                        "chaos_hook": self.chaos_hook # If API supports passing it through
                    }
                    # We might need to add chaos_hook to headers if API doesn't take it in body
                    headers = {"X-Chaos-Hook": self.chaos_hook} if self.chaos_hook else {}
                    
                    resp = await client.post(UPLOAD_URL, files=files, data=data, headers=headers, timeout=30)
                
                if resp.status_code != 200:
                    return {"id": user_id, "status": "UPLOAD_FAIL", "code": resp.status_code}
                
                job_id = resp.json().get("job_id")
                upload_time = time.perf_counter() - t_start
                
                # 2. Polling
                polls = 0
                while polls < 120: # 10 minutes max
                    await asyncio.sleep(5)
                    status_resp = await client.get(f"{STATUS_URL}{job_id}/", timeout=10)
                    if status_resp.status_code == 200:
                        data = status_resp.json()
                        if data.get("completed"):
                            total_time = time.perf_counter() - t_start
                            return {
                                "id": user_id,
                                "status": "SUCCESS",
                                "upload_time": upload_time,
                                "total_time": total_time,
                                "polls": polls
                            }
                    polls += 1
                return {"id": user_id, "status": "TIMEOUT", "job_id": job_id}
                
            except Exception as e:
                return {"id": user_id, "status": "ERROR", "error": str(e)}

    async def run(self):
        print(f"[LOAD_TEST] Starting Stage: Concurrency={self.concurrency}, Total={self.total_requests}")
        async with httpx.AsyncClient() as client:
            tasks = [self.simulate_user(client, i) for i in range(self.total_requests)]
            self.results = await asyncio.gather(*tasks)
        self.report()

    def report(self):
        successes = [r for r in self.results if r.get("status") == "SUCCESS"]
        failures = [r for r in self.results if r.get("status") != "SUCCESS"]
        
        print(f"\n--- Stage Report ---")
        print(f"Total: {len(self.results)}")
        print(f"Success: {len(successes)}")
        print(f"Failure: {len(failures)}")
        
        if successes:
            total_times = [r["total_time"] for r in successes]
            avg_time = statistics.mean(total_times)
            p95 = statistics.quantiles(total_times, n=20)[18]
            print(f"Avg Time: {avg_time:.2f}s")
            print(f"P95 Time: {p95:.2f}s")
            print(f"Throughput: {(len(successes) / max(total_times)):.2f} jobs/sec")

async def run_multi_stage():
    # Stage 1: 50 concurrent
    await LoadTester(50, 50).run()
    
    # Stage 2: 200 concurrent
    # await LoadTester(100, 200).run() # Scaled down for local testing
    
    # Stage 3: 1000 concurrent
    # await LoadTester(200, 1000).run()

if __name__ == "__main__":
    if not os.path.exists(TEST_FILE):
        # Create a dummy pdf if not exists
        os.makedirs(os.path.dirname(TEST_FILE), exist_ok=True)
        with open(TEST_FILE, "wb") as f:
            f.write(b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/Resources << >>\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 1\n>>\nstream\n \nendstream\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF")

    asyncio.run(run_multi_stage())
