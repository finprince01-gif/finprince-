import requests
import time
import uuid
import threading
import json
import argparse
import os
import numpy as np
from datetime import datetime

# Configuration
API_BASE = "http://localhost:8000/api"
UPLOAD_URL = f"{API_BASE}/ocr-staging/"
OPS_DASHBOARD_URL = f"{API_BASE}/ops-dashboard/"

class ProductionBenchmarker:
    """
    PHASE 11: PRODUCTION SCALABILITY VALIDATION.
    High-sustained load tester with forensic observability integration.
    """
    def __init__(self, token, chaos=False):
        self.token = token
        self.headers = {"Authorization": f"Bearer {token}"}
        self.results = []
        self.chaos = chaos
        self.correlation_ids = []

    def dispatch_tier(self, concurrency, pages_per_doc=1):
        print(f"\n>>> [TIER_START] Concurrency={concurrency} Pages={pages_per_doc}")
        threads = []
        start_time = time.time()
        
        for i in range(concurrency):
            cid = str(uuid.uuid4())
            self.correlation_ids.append(cid)
            t = threading.Thread(target=self._upload_and_track, args=(cid, pages_per_doc))
            threads.append(t)
            t.start()
            
        for t in threads:
            t.join()
            
        duration = time.time() - start_time
        print(f"[TIER_COMPLETE] Duration: {duration:.2f}s")
        self._print_ops_summary()

    def _upload_and_track(self, cid, pages):
        try:
            # 1. Dispatch Upload
            # Minimal Valid PDF (Phase 11 fix for PyMuPDF compatibility)
            pdf_content = (
                b'%PDF-1.7\n'
                b'1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n'
                b'2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n'
                b'3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >> endobj\n'
                b'4 0 obj << /Length 51 >> stream\n'
                b'BT /F1 24 Tf 100 100 Td (STRESS_TEST_PAYLOAD_' + cid.encode() + b') Tj ET\n'
                b'endstream\n'
                b'endobj\n'
                b'xref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\n0000000204 00000 n\n'
                b'trailer << /Size 5 /Root 1 0 R >>\n'
                b'startxref\n308\n%%EOF'
            )
            files = {'files': ('stress_test.pdf', pdf_content)}
            data = {
                "upload_session_id": str(uuid.uuid4()),
                "tenant_id": "PROD_STRESS_TIER",
                "voucher_type": "PURCHASE"
            }
            headers = {**self.headers, "X-Correlation-ID": cid}
            
            t0 = time.time()
            resp = requests.post(UPLOAD_URL, headers=headers, files=files, data=data)
            t_upload = time.time() - t0
            
            if resp.status_code == 201:
                res = resp.json()
                record_id = res.get('record_id')
                # 2. Track via Polling (Simulating UI behavior)
                self._poll_status(record_id, headers)
            else:
                print(f"[UPLOAD_FAIL] CID={cid} Status={resp.status_code}")
                
        except Exception as e:
            print(f"[BENCHMARK_ERR] {e}")

    def _poll_status(self, record_id, headers):
        # We don't use SSE here for thread safety in simple script
        poll_url = f"{API_BASE}/ocr-staging/" # Or a specific status endpoint
        attempts = 0
        while attempts < 30: # 5 min max
            try:
                resp = requests.get(poll_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json().get('data', [])
                    record = next((r for r in data if str(r.get('id')) == str(record_id)), None)
                    if record and record.get('status') in ['FINALIZED', 'SUCCESS', 'COMPLETED']:
                        return True
                time.sleep(10)
                attempts += 1
            except:
                time.sleep(5)
        return False

    def _print_ops_summary(self):
        print("\n--- OPS DASHBOARD SNAPSHOT ---")
        try:
            resp = requests.get(OPS_DASHBOARD_URL, headers=self.headers)
            if resp.status_code == 200:
                data = resp.json()
                print(json.dumps(data, indent=2))
            else:
                print(f"Failed to fetch ops dashboard: {resp.status_code}")
        except Exception as e:
            print(f"Ops Dashboard Error: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True)
    parser.add_argument("--tiers", type=str, default="50,100,250")
    args = parser.parse_args()
    
    bench = ProductionBenchmarker(args.token)
    tiers = [int(t) for t in args.tiers.split(",")]
    
    for t in tiers:
        bench.dispatch_tier(t)
        time.sleep(30) # Cool down between tiers
