import asyncio
import httpx
import time
import uuid
import random
import os
import fitz
import json
import logging
import argparse

# Configuration
API_BASE = "http://localhost:8000/api"
LOGIN_URL = f"{API_BASE}/auth/login/"
POLICY_URL = f"{API_BASE}/ocr-upload-policy/"
STAGING_URL = f"{API_BASE}/ocr-staging/"
STATUS_URL = f"{API_BASE}/ocr-job-status/"

# Distribution
DISTRIBUTION = {
    "small": {"pages": [1], "weight": 0.50},
    "medium": {"pages": [5, 10], "weight": 0.30},
    "large": {"pages": [20, 50, 100], "weight": 0.20}
}

class ForensicLoadTester:
    """
    PHASE 2: LARGE SCALE PDF SIMULATION.
    Simulates 1000 concurrent uploads with mixed invoice sizes.
    Instrumented with forensic markers.
    """
    def __init__(self, total_uploads=1000, concurrency=100):
        self.total_uploads = total_uploads
        self.concurrency = concurrency
        self.semaphore = asyncio.Semaphore(concurrency)
        self.results = []
        self.temp_dir = "temp_load_test"
        os.makedirs(self.temp_dir, exist_ok=True)
        self.start_time = None

    def create_synthetic_pdf(self, page_count):
        file_path = os.path.join(self.temp_dir, f"mock_{page_count}_{uuid.uuid4().hex[:8]}.pdf")
        doc = fitz.open()
        for i in range(page_count):
            page = doc.new_page()
            # Insert some text to make it look real-ish
            page.insert_text((50, 50), f"Forensic Stress Test Invoice\nPage {i+1} of {page_count}")
            page.insert_text((50, 100), f"Invoice No: INV-{uuid.uuid4().hex[:8].upper()}")
            page.insert_text((50, 150), f"Vendor: Mock Stress Corp")
            page.insert_text((50, 200), f"Date: 2024-05-15")
        doc.save(file_path)
        doc.close()
        return file_path

    async def simulate_upload(self, client, user_idx, headers, pages_override=None):
        """Simulates a single file upload lifecycle."""
        async with self.semaphore:
            if pages_override:
                pages = pages_override
                if pages == 1: size_cat = "small"
                elif pages <= 10: size_cat = "medium"
                else: size_cat = "large"
            else:
                r = random.random()
                if r < 0.50:
                    pages = random.choice(DISTRIBUTION["small"]["pages"])
                    size_cat = "small"
                elif r < 0.80:
                    pages = random.choice(DISTRIBUTION["medium"]["pages"])
                    size_cat = "medium"
                else:
                    pages = random.choice(DISTRIBUTION["large"]["pages"])
                    size_cat = "large"

            pdf_path = self.create_synthetic_pdf(pages)
            t0 = time.perf_counter()
            
            try:
                # 1. Get S3 Upload Policy
                # [UPLOAD_ACCEPTED] marker
                policy_resp = await client.post(
                    POLICY_URL, 
                    json={"file_name": os.path.basename(pdf_path)}, 
                    headers=headers,
                    timeout=30.0
                )
                if policy_resp.status_code != 200:
                    return {"status": "FAIL_POLICY", "code": policy_resp.status_code, "pages": pages}
                
                policy_data = policy_resp.json()
                session_id = policy_data["session_id"]
                policy = policy_data["policy"]
                print(f"[UPLOAD_ACCEPTED] user={user_idx} session={session_id} pages={pages} ({size_cat})")

                # 2. Upload to S3 (Simulated by POST to the presigned URL)
                # In local dev, this hits the same Django server if using local storage
                with open(pdf_path, 'rb') as f:
                    upload_files = {'file': (os.path.basename(pdf_path), f, 'application/pdf')}
                    upload_data = policy["fields"]
                    upload_url = policy["url"]
                    if upload_url.startswith("/"):
                        upload_url = f"http://localhost:8000{upload_url}"
                    
                    await client.post(upload_url, data=upload_data, files=upload_files, timeout=60.0)
                
                # 3. Notify Staging
                # [PAGE_FANOUT] marker
                print(f"[PAGE_FANOUT] session={session_id} pages={pages}")
                staging_resp = await client.post(
                    STAGING_URL, 
                    json={"session_ids": [session_id], "upload_session_id": session_id}, 
                    headers=headers,
                    timeout=30.0
                )
                if staging_resp.status_code != 202:
                    return {"status": "FAIL_STAGING", "code": staging_resp.status_code, "pages": pages}
                
                job_id = staging_resp.json()["job_id"]
                # [SQS_PUSH] is handled by backend logs
                
                # 4. Poll for completion
                attempts = 0
                max_attempts = 120 # 4 minutes for large PDFs
                while attempts < max_attempts:
                    status_resp = await client.get(f"{STATUS_URL}{job_id}/", headers=headers, timeout=10.0)
                    if status_resp.status_code != 200:
                        break
                    
                    data = status_resp.json()
                    if data["status"] in ["COMPLETED", "FAILED", "PARTIAL"]:
                        latency = time.perf_counter() - t0
                        # [ASSEMBLY_FINALIZED] marker
                        print(f"[ASSEMBLY_FINALIZED] job={job_id} status={data['status']} pages={pages} latency={latency:.2f}s")
                        return {"status": data["status"], "latency": latency, "pages": pages, "size": size_cat}
                    
                    await asyncio.sleep(2)
                    attempts += 1
                
                return {"status": "TIMEOUT", "pages": pages, "size": size_cat}

            except Exception as e:
                print(f"[ERROR] User {user_idx}: {e}")
                return {"status": "CRASH", "error": str(e), "pages": pages}
            finally:
                if os.path.exists(pdf_path):
                    os.remove(pdf_path)

    async def run_benchmark(self, client, user_headers):
        page_counts = [1, 5, 10, 20, 50, 100]
        print("\n" + "="*50)
        print("SCALABILITY BENCHMARK MODE")
        print("="*50)
        
        self.results = []
        for pc in page_counts:
            print(f"\n[BENCHMARK] Testing {pc} pages...")
            headers = random.choice(user_headers)
            res = await self.simulate_upload(client, 999, headers, pages_override=pc)
            self.results.append(res)
            if res["status"] == "COMPLETED":
                print(f"[RESULT] {pc} pages: {res['latency']:.2f}s")
            else:
                print(f"[RESULT] {pc} pages: FAILED ({res['status']})")
        
        self.report()

    async def run(self, benchmark=False, custom_distribution=None):
        self.start_time = time.time()
        self.semaphore = asyncio.Semaphore(self.concurrency)
        print(f"=== FORENSIC LOAD TEST START ===")
        print(f"Total Uploads: {self.total_uploads}")
        print(f"Concurrency:   {self.concurrency}")
        print(f"Mock Mode:     ENABLED")
        
        async with httpx.AsyncClient(timeout=None) as client:
            # 1. Login all users (reusing 50 seeded users)
            user_headers = []
            for i in range(50):
                email = f"stress_test_{i}@finpixe.com"
                try:
                    resp = await client.post(LOGIN_URL, json={"email": "stress_branch@finpixe.com", "username": email, "password": "Password123"})
                    if resp.status_code == 200:
                        token = resp.json().get("access")
                        user_headers.append({"Authorization": f"Bearer {token}"})
                except Exception:
                    continue
            
            if not user_headers:
                print("Failed to login any users. Aborting.")
                return

            if benchmark:
                await self.run_benchmark(client, user_headers)
                return

            # 2. Start uploads
            tasks = []
            # Phase 8: Custom Distribution Logic
            dist = custom_distribution if custom_distribution else [None] * self.total_uploads
            
            for i in range(self.total_uploads):
                pages_override = dist[i] if i < len(dist) else None
                tasks.append(self.simulate_upload(client, i, random.choice(user_headers), pages_override=pages_override))
            
            self.results = await asyncio.gather(*tasks)
            
        self.report()

    def report(self):
        duration = time.time() - self.start_time
        print("\n" + "="*50)
        print("FORENSIC LOAD TEST REPORT")
        print("="*50)
        
        success = [r for r in self.results if r.get("status") == "COMPLETED"]
        failed = [r for r in self.results if r.get("status") != "COMPLETED"]
        
        total_pages = sum(r.get("pages", 0) for r in self.results)
        
        print(f"Total Duration:   {duration:.2f}s")
        print(f"Total Uploads:    {len(self.results)}")
        print(f"Total Pages:      {total_pages}")
        print(f"Throughput:       {len(self.results)/duration:.2f} uploads/sec")
        print(f"Page Throughput:  {total_pages/duration:.2f} pages/sec")
        print(f"Success Rate:     {(len(success)/len(self.results))*100:.2f}%")
        
        if success:
            latencies = [r["latency"] for r in success]
            latencies.sort()
            avg = sum(latencies) / len(latencies)
            p95 = latencies[int(len(latencies)*0.95)] if len(latencies) >= 20 else latencies[-1]
            p99 = latencies[int(len(latencies)*0.99)] if len(latencies) >= 100 else latencies[-1]
            print(f"Avg Latency:      {avg:.2f}s")
            print(f"P95 Latency:      {p95:.2f}s")
            print(f"P99 Latency:      {p99:.2f}s")
            
            # Per size stats
            for size in ["small", "medium", "large", "benchmark"]:
                size_res = [r for r in success if r.get("size") == size]
                if size_res:
                    s_lats = [r["latency"] for r in size_res]
                    print(f"  [{size.upper()}] Avg: {sum(s_lats)/len(s_lats):.2f}s (Count: {len(size_res)})")

        if failed:
            print("\nFailure Summary:")
            fail_types = {}
            for f in failed:
                ft = f.get("status")
                fail_types[ft] = fail_types.get(ft, 0) + 1
            for ft, count in fail_types.items():
                print(f"  - {ft}: {count}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--total", type=int, default=1000)
    parser.add_argument("--concurrency", type=int, default=100)
    parser.add_argument("--benchmark", action="store_true")
    parser.add_argument("--stress", action="store_true")
    args = parser.parse_args()

    distribution = None
    if args.stress:
        # Phase 8: 1000 Concurrent Validation
        # Ratios: 50% Small (1), 30% Medium (5), 20% Large (50)
        total = args.total
        distribution = []
        for _ in range(int(total * 0.5)): distribution.append(1)
        for _ in range(int(total * 0.3)): distribution.append(5)
        for _ in range(int(total * 0.2)): distribution.append(50)
        # Pad remaining if rounding issues
        while len(distribution) < total: distribution.append(1)
        import random
        random.shuffle(distribution)
        print(f"=== PHASE 8: SUSTAINED {total} CONCURRENT STRESS TEST ===")
        print(f"Distribution: 50% Small, 30% Medium, 20% Large")

    tester = ForensicLoadTester(total_uploads=args.total, concurrency=args.concurrency)
    asyncio.run(tester.run(benchmark=args.benchmark, custom_distribution=distribution))
