"""
PHASE 3 – STAGED LOAD TEST HARNESS
Simulates concurrent uploads at different load levels.
Measures: P50/P95/P99 latency, queue depth, pages/hour, failure rate.

NOTE: This sends real uploads to the local server. Start the server first:
  python manage.py runserver --noreload
  python start_cluster.py

This test uploads PDFs from the test folder to the live API endpoint.
"""
import os, sys, time, json, asyncio, statistics, random
from pathlib import Path
from datetime import datetime

import django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

import requests
import boto3
from django.conf import settings

# ─── CONFIG ────────────────────────────────────────────────────────────
API_BASE = "http://localhost:8000"
# Prefer a real test PDF — pick any available in the project
TEST_PDF_CANDIDATES = [
    r"C:\Users\ulaganathan\Downloads\New folder (2)",
    r"C:\108\AI-accounting-0.03\backend\scratch",
]
LOAD_LEVELS = [5, 10, 25, 50]  # concurrent uploads per stage
SESSION_TIMEOUT = 300  # seconds max per upload
AUTH_TOKEN = None  # Will be fetched via login

def find_test_pdfs(limit=5):
    pdfs = []
    for folder in TEST_PDF_CANDIDATES:
        p = Path(folder)
        if p.exists():
            found = list(p.rglob("*.pdf"))[:limit]
            pdfs.extend(found)
        if len(pdfs) >= limit:
            break
    return pdfs[:limit]

def get_auth_token():
    """Get a JWT token from the API."""
    try:
        resp = requests.post(f"{API_BASE}/api/auth/login/", json={
            "username": "admin", "password": "admin123"
        }, timeout=10)
        if resp.status_code == 200:
            return resp.json().get('access') or resp.json().get('token')
    except Exception as e:
        pass
    # Try alternative auth
    try:
        resp = requests.post(f"{API_BASE}/api/auth/token/", json={
            "username": "admin", "password": "admin123"
        }, timeout=10)
        if resp.status_code == 200:
            return resp.json().get('access')
    except Exception:
        pass
    return None

def check_server_alive():
    try:
        resp = requests.get(f"{API_BASE}/api/health/", timeout=5)
        return resp.status_code < 500
    except Exception:
        try:
            resp = requests.get(f"{API_BASE}/", timeout=5)
            return True
        except Exception:
            return False

def upload_single_pdf(pdf_path, token, session_label):
    """Upload a single PDF and measure time to terminal state."""
    t0 = time.time()
    try:
        headers = {}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        with open(pdf_path, 'rb') as f:
            files = {'file': (Path(pdf_path).name, f, 'application/pdf')}
            data = {'tenant_id': 'load_test', 'upload_type': 'PURCHASE'}
            resp = requests.post(
                f"{API_BASE}/api/ocr/upload/",
                files=files, data=data, headers=headers,
                timeout=30
            )

        upload_time = time.time() - t0
        if resp.status_code not in (200, 201, 202):
            return {'status': 'HTTP_ERROR', 'code': resp.status_code, 'upload_time': upload_time, 'total_time': upload_time}

        result = resp.json()
        record_id = (result.get('record_id') or result.get('id') or
                     result.get('data', {}).get('record_id'))

        if not record_id:
            return {'status': 'NO_RECORD_ID', 'upload_time': upload_time, 'total_time': upload_time}

        # Poll for terminal state
        poll_start = time.time()
        terminal_states = {'FINALIZED', 'FAILED', 'COMPLETED', 'HYDRATION_READY'}
        while time.time() - poll_start < SESSION_TIMEOUT:
            try:
                poll_resp = requests.get(
                    f"{API_BASE}/api/ocr/status/{record_id}/",
                    headers=headers, timeout=10
                )
                if poll_resp.status_code == 200:
                    pdata = poll_resp.json()
                    state = pdata.get('status') or pdata.get('state') or pdata.get('pipeline_status')
                    if state in terminal_states:
                        total_time = time.time() - t0
                        return {
                            'status': state,
                            'upload_time': upload_time,
                            'total_time': total_time,
                            'poll_count': int((time.time() - poll_start) / 2)
                        }
            except Exception:
                pass
            time.sleep(2)

        return {'status': 'TIMEOUT', 'upload_time': upload_time, 'total_time': time.time() - t0}

    except Exception as e:
        return {'status': 'ERROR', 'error': str(e), 'upload_time': time.time() - t0, 'total_time': time.time() - t0}

def get_sqs_depths():
    try:
        sqs = boto3.client('sqs', region_name=os.getenv('AWS_REGION', 'ap-south-1'),
                           aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                           aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'))
        queues = {
            'ai': os.getenv('SQS_AI_QUEUE_URL'),
            'assembly': os.getenv('SQS_ASSEMBLY_QUEUE_URL'),
            'finalize': os.getenv('SQS_FINALIZE_QUEUE_URL'),
        }
        depths = {}
        for name, url in queues.items():
            if url:
                resp = sqs.get_queue_attributes(
                    QueueUrl=url,
                    AttributeNames=['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
                )
                depths[name] = {
                    'visible': int(resp['Attributes'].get('ApproximateNumberOfMessages', 0)),
                    'inflight': int(resp['Attributes'].get('ApproximateNumberOfMessagesNotVisible', 0)),
                }
        return depths
    except Exception as e:
        return {}

def run_load_stage(concurrent, pdfs, token):
    """Run a single load stage with N concurrent uploads."""
    print(f"\n  Running {concurrent} concurrent uploads...")

    # Queue SQS depth before
    depths_before = get_sqs_depths()

    # Use threading for concurrent uploads
    from concurrent.futures import ThreadPoolExecutor, as_completed
    t_stage_start = time.time()
    results = []

    # Repeat PDFs if fewer than concurrent
    upload_pool = (pdfs * ((concurrent // len(pdfs)) + 1))[:concurrent]

    with ThreadPoolExecutor(max_workers=concurrent) as executor:
        futures = {
            executor.submit(upload_single_pdf, pdf, token, f"stage_{concurrent}_{i}"): i
            for i, pdf in enumerate(upload_pool)
        }
        completed = 0
        for future in as_completed(futures, timeout=SESSION_TIMEOUT + 30):
            try:
                r = future.result()
                results.append(r)
                completed += 1
                if completed % max(1, concurrent // 5) == 0:
                    print(f"    ... {completed}/{concurrent} done")
            except Exception as e:
                results.append({'status': 'FUTURE_ERROR', 'error': str(e), 'total_time': SESSION_TIMEOUT})

    stage_duration = time.time() - t_stage_start
    depths_after = get_sqs_depths()

    # Compute stats
    total_times = [r['total_time'] for r in results if r.get('total_time')]
    upload_times = [r['upload_time'] for r in results if r.get('upload_time')]
    successful = [r for r in results if r.get('status') in ('FINALIZED', 'COMPLETED', 'HYDRATION_READY')]
    failed = [r for r in results if r.get('status') in ('FAILED', 'ERROR', 'HTTP_ERROR', 'TIMEOUT')]

    def pct(data, p):
        if not data: return 0
        sorted_d = sorted(data)
        idx = int(len(sorted_d) * p / 100)
        return round(sorted_d[min(idx, len(sorted_d)-1)], 2)

    stats = {
        'concurrent': concurrent,
        'total_uploads': len(results),
        'successful': len(successful),
        'failed': len(failed),
        'failure_rate_pct': round(len(failed) / max(1, len(results)) * 100, 1),
        'stage_duration_s': round(stage_duration, 1),
        'uploads_per_hour': round(len(successful) / max(0.001, stage_duration) * 3600, 0),
        'p50_total_s': pct(total_times, 50),
        'p95_total_s': pct(total_times, 95),
        'p99_total_s': pct(total_times, 99),
        'p50_upload_s': pct(upload_times, 50),
        'p95_upload_s': pct(upload_times, 95),
        'queue_depth_ai_before': depths_before.get('ai', {}).get('visible', 'n/a'),
        'queue_depth_ai_after': depths_after.get('ai', {}).get('visible', 'n/a'),
    }
    return stats

def main():
    print("=" * 70)
    print("PHASE 3 – STAGED LOAD TEST")
    print("=" * 70)
    print(f"  Started: {datetime.now().isoformat()}")

    # Pre-flight checks
    if not check_server_alive():
        print("\n[ERROR] Server is not responding at http://localhost:8000")
        print("  Start with: python manage.py runserver --noreload")
        return

    print("  Server: ALIVE")
    token = get_auth_token()
    print(f"  Auth:   {'OK' if token else 'SKIPPED (no token)'}")

    pdfs = find_test_pdfs(10)
    if not pdfs:
        print("\n[ERROR] No test PDFs found.")
        print(f"  Checked: {TEST_PDF_CANDIDATES}")
        return
    print(f"  Test PDFs: {len(pdfs)} found")
    for p in pdfs[:3]:
        print(f"    {p}")

    all_stats = []
    for level in LOAD_LEVELS:
        print(f"\n{'='*70}")
        print(f"LOAD LEVEL: {level} concurrent uploads")
        print(f"{'='*70}")
        stats = run_load_stage(level, pdfs, token)
        all_stats.append(stats)

        print(f"\n  RESULTS:")
        print(f"    Successful:      {stats['successful']}/{stats['total_uploads']}")
        print(f"    Failure rate:    {stats['failure_rate_pct']}%")
        print(f"    Stage duration:  {stats['stage_duration_s']}s")
        print(f"    Uploads/hour:    {stats['uploads_per_hour']:.0f}")
        print(f"    P50 (total):     {stats['p50_total_s']}s")
        print(f"    P95 (total):     {stats['p95_total_s']}s")
        print(f"    P99 (total):     {stats['p99_total_s']}s")
        print(f"    P50 (upload):    {stats['p50_upload_s']}s")
        print(f"    AI queue before: {stats['queue_depth_ai_before']}")
        print(f"    AI queue after:  {stats['queue_depth_ai_after']}")

        # Cool-down between stages
        if level != LOAD_LEVELS[-1]:
            print(f"\n  Cooling down 30s...")
            time.sleep(30)

    # Final summary table
    print(f"\n\n{'='*70}")
    print("LOAD TEST SUMMARY TABLE")
    print(f"{'='*70}")
    print(f"  {'Concurrent':<12} {'Success%':>9} {'P50(s)':>8} {'P95(s)':>8} {'P99(s)':>8} {'Uploads/hr':>11}")
    print(f"  {'-'*58}")
    for s in all_stats:
        success_pct = round(100 - s['failure_rate_pct'], 1)
        print(f"  {s['concurrent']:<12} {success_pct:>9.1f} {s['p50_total_s']:>8} {s['p95_total_s']:>8} {s['p99_total_s']:>8} {s['uploads_per_hour']:>11.0f}")

    # Save JSON results
    out_path = Path(r"c:\108\AI-accounting-0.03\backend\scratch\load_test_results.json")
    with open(out_path, 'w') as f:
        json.dump(all_stats, f, indent=2)
    print(f"\n  Results saved to: {out_path}")

if __name__ == "__main__":
    main()
