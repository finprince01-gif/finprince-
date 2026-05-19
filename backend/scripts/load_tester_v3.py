import asyncio
import httpx
import time
import uuid
import random
import os
import sys

# Configuration
API_BASE = "http://localhost:8000/api"
LOGIN_URL = f"{API_BASE}/auth/login/"
POLICY_URL = f"{API_BASE}/ocr-upload-policy/"
STAGING_URL = f"{API_BASE}/ocr-staging/"
STATUS_URL = f"{API_BASE}/ocr-job-status/"
TEST_FILE = "tests/test.pdf"

class LoadTesterV3:
    """
    PHASE 14: Forensic Stress Tester.
    Validates concurrency, backpressure, and terminal state deterministic behavior.
    """
    def __init__(self, total_users=10, concurrency=5):
        self.total_users = total_users
        self.concurrency = concurrency
        self.semaphore = asyncio.Semaphore(concurrency)
        self.results = []

    async def simulate_user(self, client: httpx.AsyncClient, user_id: int):
        async with self.semaphore:
            t0 = time.perf_counter()
            try:
                # 0. Login
                print(f"[TEST_START] User {user_id}")
                login_resp = await client.post(
                    LOGIN_URL,
                    json={
                        "email": "stress_branch@finpixe.com", 
                        "username": f"stress_test_{user_id}@finpixe.com", 
                        "password": "Password123"
                    }
                )
                if login_resp.status_code != 200:
                    print(f"[LOGIN_FAILED] User {user_id}: {login_resp.status_code}")
                    return {"id": user_id, "status": "LOGIN_FAIL", "code": login_resp.status_code}
                
                access_token = login_resp.json().get("access")
                headers = {"Authorization": f"Bearer {access_token}"}
                print(f"[LOGGED_IN] User {user_id}")

                # 1. Get S3 Upload Policy
                file_name = f"stress_{user_id}_{uuid.uuid4().hex[:8]}.pdf"
                policy_resp = await client.post(
                    POLICY_URL,
                    json={"file_name": file_name, "content_type": "application/pdf"},
                    headers=headers
                )
                if policy_resp.status_code != 200:
                    return {"id": user_id, "status": "POLICY_FAIL", "code": policy_resp.status_code}
                
                policy_data = policy_resp.json()
                session_id = policy_data["session_id"]
                policy = policy_data["policy"]
                print(f"[POLICY_OK] User {user_id} session={session_id}")
                
                # 2. Simulate Upload to S3 (Real POST)
                if not os.path.exists(TEST_FILE):
                    return {"id": user_id, "status": "FILE_MISSING", "path": TEST_FILE}

                with open(TEST_FILE, 'rb') as f:
                    upload_files = {'file': (file_name, f, 'application/pdf')}
                    upload_data = policy["fields"]
                    
                    upload_url = policy["url"]
                    if upload_url.startswith("/"):
                        upload_url = f"http://localhost:8000{upload_url}"
                    
                    upload_resp = await client.post(
                        upload_url,
                        data=upload_data,
                        files=upload_files
                    )
                
                if upload_resp.status_code not in [200, 201, 204]:
                    return {"id": user_id, "status": "UPLOAD_FAIL", "code": upload_resp.status_code, "text": upload_resp.text}
                
                print(f"[UPLOAD_OK] User {user_id}")

                # 3. Notify Backend of Upload Completion
                staging_resp = await client.post(
                    STAGING_URL,
                    json={"session_ids": [session_id], "voucher_type": "PURCHASE"},
                    headers=headers
                )
                
                if staging_resp.status_code != 202:
                    return {"id": user_id, "status": "STAGING_FAIL", "code": staging_resp.status_code}
                
                job_id = staging_resp.json()["job_id"]
                print(f"[STAGING_OK] User {user_id} job={job_id}")

                # 4. Adaptive Polling for Terminal State
                attempts = 0
                while attempts < 30: # 1 min max
                    status_resp = await client.get(f"{STATUS_URL}{job_id}/", headers=headers)
                    if status_resp.status_code != 200:
                        break
                    
                    data = status_resp.json()
                    if data["status"] in ["COMPLETED", "FAILED", "PARTIAL"]:
                        latency = time.perf_counter() - t0
                        print(f"[FINISH] User {user_id} Status={data['status']} Latency={latency:.2f}s")
                        return {"id": user_id, "status": data["status"], "latency": latency}
                    
                    # Adaptive sleep
                    wait = data.get("poll_after_seconds", 2)
                    await asyncio.sleep(wait)
                    attempts += 1
                
                return {"id": user_id, "status": "TIMEOUT"}

            except Exception as e:
                print(f"[ERROR] User {user_id}: {e}")
                return {"id": user_id, "status": "CRASH", "error": str(e)}

    async def run(self):
        print(f"[LOAD_TEST_V3] Starting: Concurrency={self.concurrency}, Total={self.total_users}")
        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = [self.simulate_user(client, i) for i in range(self.total_users)]
            self.results = await asyncio.gather(*tasks)
        
        self.report()

    def report(self):
        print("\n" + "="*40)
        print("LOAD TEST REPORT")
        print("="*40)
        success = [r for r in self.results if r.get("status") == "COMPLETED"]
        failed = [r for r in self.results if r.get("status") != "COMPLETED"]
        
        print(f"Total Requests: {len(self.results)}")
        print(f"Successes:      {len(success)}")
        print(f"Failures:       {len(failed)}")
        
        if success:
            latencies = [r["latency"] for r in success]
            avg = sum(latencies) / len(latencies)
            p99 = sorted(latencies)[int(len(latencies)*0.99)] if len(latencies) >= 100 else max(latencies)
            print(f"Avg Latency:    {avg:.2f}s")
            print(f"P99 Latency:    {p99:.2f}s")
        
        if failed:
            print("\nError Samples:")
            for f in failed[:5]:
                print(f"  - User {f.get('id')}: {f.get('status')} (Code: {f.get('code')})")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--total", type=int, default=10)
    parser.add_argument("--concurrency", type=int, default=5)
    args = parser.parse_args()

    tester = LoadTesterV3(total_users=args.total, concurrency=args.concurrency)
    asyncio.run(tester.run())
