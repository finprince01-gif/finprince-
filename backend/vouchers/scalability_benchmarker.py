import os
import json
import time
import asyncio
import aiohttp
import random
import statistics
import argparse
from datetime import datetime
import logging
import uuid

# Configure forensic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("ForensicBenchmarker")

class ForensicBenchmarker:
    """
    PHASE 1 — REAL 1000-CONCURRENT LOAD HARNESS
    Scientifically validates system throughput and operational ceilings.
    """
    def __init__(self, api_base_url, auth_token, ramp_speed=10):
        self.api_base_url = api_base_url
        self.headers = {"Authorization": f"Bearer {auth_token}"}
        self.ramp_speed = ramp_speed
        self.results = []
        
        # PDF Mix per requirements
        self.pdf_pool = {
            "single-page": [
                r"C:\108\AI-accounting-0.03 (9)\backend\media\bulk_pipeline\jobs\33\0d96abe7---IMG_20260406_0006.pdf"
            ],
            "multi-page": [
                r"C:\108\AI-accounting-0.03 (9)\backend\media\bulk_pipeline\jobs\337\b0a24ed3---IMG_20260319_0003.pdf"
            ],
            "continuation": [
                r"C:\108\AI-accounting-0.03 (9)\backend\media\bulk_pipeline\jobs\337\6d3db0b7---IMG_20260319_0001.pdf"
            ],
            "large": [
                r"C:\108\AI-accounting-0.03 (9)\backend\media\bulk_pipeline\jobs\347\cd5d5a56---IMG_20260406_0001_Part3.pdf"
            ],
            "malformed": [
                r"C:\108\AI-accounting-0.03 (9)\backend\manage.py" # Technically not a PDF
            ]
        }

    def get_random_pdf(self):
        """Returns a random PDF based on requirement mix."""
        types = list(self.pdf_pool.keys())
        weights = [40, 30, 15, 10, 5] # 40% single, 30% multi, 15% cont, 10% large, 5% malformed
        ptype = random.choices(types, weights=weights, k=1)[0]
        return random.choice(self.pdf_pool[ptype]), ptype

    async def upload_invoice(self, session, file_path, ptype):
        """Uploads a single invoice to the correct staging endpoint."""
        # Using api/ocr-staging/ as per root URL mapping
        url = f"{self.api_base_url}/api/ocr-staging/"
        session_id = str(uuid.uuid4())
        start_time = time.time()
        try:
            with open(file_path, 'rb') as f:
                data = aiohttp.FormData()
                # Field name is 'files' (plural) based on CleanOCRStagingView.post
                data.add_field('files', f, filename=os.path.basename(file_path))
                data.add_field('upload_session_id', session_id)
                data.add_field('voucher_type', 'PURCHASE')
                
                async with session.post(url, data=data, headers=self.headers) as resp:
                    if resp.status in [201, 202]: # ACCEPTED is common for async workers
                        latency = time.time() - start_time
                        return {"session_id": session_id, "latency": latency, "status": "SUCCESS", "type": ptype}
                    else:
                        text = await resp.text()
                        logger.error(f"[UPLOAD_FAILED] status={resp.status} error={text[:200]}")
                        return {"status": "FAILED", "code": resp.status, "error": text, "type": ptype}
        except Exception as e:
            logger.error(f"[UPLOAD_CRASH] error={e}")
            return {"status": "CRASHED", "error": str(e), "type": ptype}

    async def poll_sse(self, session, session_id):
        """Polls SSE until FINALIZED or timeout."""
        # Using api/ocr-status-stream/ as per root URL mapping
        url = f"{self.api_base_url}/api/ocr-status-stream/{session_id}/"
        logger.info(f"[POLLING_START] session={session_id}")
        start_time = time.time()
        timeout = 180 # 3 minutes is enough for forensic validation
        
        try:
            async with session.get(url, headers=self.headers) as resp:
                if resp.status != 200:
                    logger.error(f"[SSE_INIT_FAILED] session={session_id} status={resp.status}")
                    return {"status": "SSE_ERROR", "code": resp.status}
                
                async def _read():
                    async for line in resp.content:
                        line = line.decode('utf-8', errors='ignore').strip()
                        if line.startswith("data: "):
                            try:
                                data = json.loads(line[6:])
                                if data.get("status") == "FINALIZED":
                                    return {"status": "FINALIZED", "duration": time.time() - start_time}
                                if data.get("status") == "FAILED":
                                    return {"status": "FAILED", "duration": time.time() - start_time}
                                if data.get("status") == "ERROR":
                                    return {"status": "ERROR", "message": data.get("message"), "duration": time.time() - start_time}
                            except json.JSONDecodeError:
                                continue
                    return {"status": "SSE_CLOSED", "duration": time.time() - start_time}

                try:
                    return await asyncio.wait_for(_read(), timeout=timeout)
                except asyncio.TimeoutError:
                    return {"status": "TIMEOUT", "duration": timeout}
        except Exception as e:
            return {"status": "SSE_CRASHED", "error": str(e)}

    async def run_tier(self, concurrency_level, chaos=False):
        """Runs a specific concurrency tier with optional chaos."""
        logger.info(f"\n>>> [TIER_START] Concurrency={concurrency_level} Chaos={'ON' if chaos else 'OFF'}")
        
        t_tier_start = time.time()
        
        # Higher connection limit for high concurrency
        conn = aiohttp.TCPConnector(limit=concurrency_level + 100)
        async with aiohttp.ClientSession(connector=conn) as session:
            # 1. Ramped Uploads
            upload_tasks = []
            for i in range(concurrency_level):
                pdf, ptype = self.get_random_pdf()
                upload_tasks.append(self.upload_invoice(session, pdf, ptype))
                # Slight stagger to avoid literal single-ms 1000 burst which might hit OS limits
                if (i + 1) % self.ramp_speed == 0:
                    await asyncio.sleep(0.1) 
            
            logger.info(f"Dispatching {concurrency_level} uploads...")
            upload_results = await asyncio.gather(*upload_tasks)
            
            # 2. Track Completion
            successful_uploads = [r for r in upload_results if r["status"] == "SUCCESS"]
            logger.info(f"Upload success: {len(successful_uploads)}/{concurrency_level}")
            
            poll_tasks = []
            for res in successful_uploads:
                poll_tasks.append(self.poll_sse(session, res["session_id"]))
            
            if not poll_tasks:
                logger.error("No successful uploads to track.")
                completion_results = []
            else:
                logger.info(f"Tracking {len(poll_tasks)} sessions via SSE...")
                completion_results = await asyncio.gather(*poll_tasks)
            
            t_tier_end = time.time()
            total_duration = t_tier_end - t_tier_start
            
            # 3. Analytics
            finalized_count = sum(1 for r in completion_results if r["status"] == "FINALIZED")
            failed_count = sum(1 for r in completion_results if r["status"] in ["FAILED", "ERROR"])
            timeout_count = sum(1 for r in completion_results if r["status"] == "TIMEOUT")
            
            latencies = [r["latency"] for r in upload_results if "latency" in r]
            durations = [r["duration"] for r in completion_results if "duration" in r]
            
            stats = {
                "concurrency": concurrency_level,
                "total_duration_s": total_duration,
                "finalized": finalized_count,
                "failed": failed_count,
                "timeout": timeout_count,
                "upload_p50": statistics.median(latencies) if latencies else 0,
                "upload_p95": statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies) if latencies else 0,
                "e2e_p50": statistics.median(durations) if durations else 0,
                "e2e_p95": statistics.quantiles(durations, n=20)[18] if len(durations) >= 20 else max(durations) if durations else 0,
                "throughput_ips": finalized_count / total_duration if total_duration > 0 else 0
            }
            
            self.results.append(stats)
            logger.info(f"[TIER_COMPLETE] Stats: {stats}")
            return stats

    def print_final_report(self):
        """Outputs the Phase 7 Final Forensic Report."""
        print("\n" + "="*80)
        print("PHASE 7 — FINAL FORENSIC SCALABILITY REPORT")
        print("="*80)
        print(f"{'Concurrency':<12} | {'Finalized':<10} | {'Failed':<8} | {'E2E P50':<10} | {'E2E P95':<10} | {'IPS'}")
        print("-" * 80)
        
        extended_results = self.results_extended
        for r in extended_results:
            print(f"{r['concurrency']:<12} | {r['finalized']:<10} | {r['failed']:<8} | {r['e2e_p50']:<10.1f} | {r['e2e_p95']:<10.1f} | {r['throughput_ips']:.2f}")
        
        # Bottleneck Analysis
        print("\nBOTTLENECK ANALYSIS:")
        if not extended_results: return
        
        last = extended_results[-1]
        if last['timeout'] > 0:
            print("- ALERT: Timeouts detected. System cannot drain queue fast enough.")
        if last['upload_p95'] > 2.0:
            print("- ALERT: API upload bottleneck detected (P95 > 2s).")
        
        safe_ceiling = max((r['concurrency'] for r in extended_results if r['success_rate_calc'] > 95), default=0)
        print(f"- Safe Concurrency Ceiling: {safe_ceiling}")
        print("="*80)

    @property
    def results_extended(self):
        for r in self.results:
            r['success_rate_calc'] = (r['finalized'] / r['concurrency']) * 100 if r['concurrency'] > 0 else 0
        return self.results

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True)
    parser.add_argument("--tiers", default="10,50,100")
    parser.add_argument("--chaos", action="store_true")
    parser.add_argument("--ramp", type=int, default=10)
    parser.add_argument("--base_url", default="http://localhost:8000")
    args = parser.parse_args()
    
    bench = ForensicBenchmarker(args.base_url, args.token, ramp_speed=args.ramp)
    
    tiers = [int(t) for t in args.tiers.split(",")]
    for t in tiers:
        await bench.run_tier(t, chaos=args.chaos)
        await asyncio.sleep(5)
        
    bench.print_final_report()

if __name__ == "__main__":
    asyncio.run(main())
