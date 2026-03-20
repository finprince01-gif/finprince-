"""
Chaos + Load Test Suite for Kafka Invoice Pipeline
====================================================
Tests 11 scenarios from the 500K readiness prompt.

Usage:
  python chaos_test.py                 # all tests
  python chaos_test.py redis_down      # specific scenario
  python chaos_test.py load_1k         # load test 1k jobs

Requirements:
  - Django server running (python manage.py runserver)
  - Pipeline workers running (python start_pipeline.py)
"""
import os
import sys
import json
import time
import random
import hashlib
import logging
import argparse
import threading
import requests
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger('chaos')

BASE_URL  = os.environ.get('TEST_BASE_URL', 'http://localhost:8000')
AUTH_TOKEN = os.environ.get('TEST_AUTH_TOKEN', '')   # set this for authenticated endpoints
SAMPLE_PDF = Path(__file__).parent / 'tests' / 'fixtures' / 'sample_invoice.pdf'

HEADERS = {'Authorization': f'Bearer {AUTH_TOKEN}'} if AUTH_TOKEN else {}


# ─────────────────────────────────────────────────────────────────────────────
# HELPER UTILITIES
# ─────────────────────────────────────────────────────────────────────────────
def create_fake_pdf(size_bytes: int = 1024) -> bytes:
    """Minimal valid-looking PDF bytes for testing."""
    content = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF"""
    return content


def healthz() -> dict:
    r = requests.get(f'{BASE_URL}/api/bulk-healthz/', timeout=5)
    return r.json()


def upload_file(filename: str = 'test.pdf', content: bytes = None) -> requests.Response:
    if content is None:
        content = create_fake_pdf()
    files = [('files', (filename, content, 'application/pdf'))]
    return requests.post(f'{BASE_URL}/api/bulk-upload/', files=files,
                         headers=HEADERS, timeout=15)


def get_status(job_id: int) -> dict:
    r = requests.get(f'{BASE_URL}/api/bulk-status/{job_id}/', headers=HEADERS, timeout=5)
    return r.json()


def get_metrics() -> dict:
    r = requests.get(f'{BASE_URL}/api/bulk-metrics/', headers=HEADERS, timeout=5)
    return r.json() if r.status_code == 200 else {}


def print_result(test_name: str, passed: bool, detail: str = ''):
    icon = '✅' if passed else '❌'
    logger.info(f"{icon} {test_name:<40} {detail}")


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 1: Duplicate upload idempotency
# ─────────────────────────────────────────────────────────────────────────────
def test_idempotency():
    logger.info("\n=== TEST: Duplicate Upload Idempotency ===")
    content = create_fake_pdf()

    r1 = upload_file('inv_idem.pdf', content)
    r2 = upload_file('inv_idem.pdf', content)   # same file, same size

    j1 = r1.json()
    j2 = r2.json()

    logger.info(f"  Upload 1: {j1}")
    logger.info(f"  Upload 2: {j2}")

    job1 = j1.get('job_id')
    job2 = j2.get('job_id')
    status2 = j2.get('status', '')

    same_job = (job1 and job2 and job1 == job2) or 'already' in status2
    print_result('Duplicate upload → same job / already_processing',
                 same_job, f"job1={job1} job2={job2}")
    return same_job


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 2: Health check endpoints
# ─────────────────────────────────────────────────────────────────────────────
def test_health_endpoint():
    logger.info("\n=== TEST: Health Endpoint ===")
    h = healthz()
    logger.info(f"  Health: {h}")
    has_fields = 'redis' in h and 'kafka' in h and 'status' in h
    print_result('Health endpoint returns redis/kafka/status', has_fields, str(h))
    return has_fields


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 3: 503 has retry_after field
# ─────────────────────────────────────────────────────────────────────────────
def test_retry_after_header():
    logger.info("\n=== TEST: 503 includes retry_after ===")
    # Upload 6+ files to exceed tenant limit (if applicable)
    results = []
    for i in range(8):
        r = upload_file(f'flood_{i}.pdf')
        if r.status_code == 503:
            body = r.json()
            has_retry = 'retry_after' in body and 'Retry-After' in r.headers
            results.append(has_retry)
            logger.info(f"  503 body: {body}")
            logger.info(f"  Retry-After header: {r.headers.get('Retry-After')}")
            break

    passed = any(results)
    print_result('503 includes retry_after in body + Retry-After header', passed)
    return passed


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 4: Large file protection (page limit)
# ─────────────────────────────────────────────────────────────────────────────
def test_large_batch():
    logger.info("\n=== TEST: Large Batch (>MAX_PAGES) ===")
    from vouchers.pipeline.health import MAX_PAGES_PER_JOB

    # Upload more files than MAX_PAGES_PER_JOB
    files = []
    count = MAX_PAGES_PER_JOB + 10
    content = create_fake_pdf()
    for i in range(count):
        files.append(('files', (f'large_{i}.pdf', content, 'application/pdf')))

    r = requests.post(f'{BASE_URL}/api/bulk-upload/', files=files,
                      headers=HEADERS, timeout=30)
    body = r.json()
    logger.info(f"  Response: {body}")
    # Should succeed but cap at MAX_PAGES_PER_JOB
    passed = r.status_code == 200 and body.get('total_files', 0) <= MAX_PAGES_PER_JOB
    print_result(f'Large batch capped at {MAX_PAGES_PER_JOB} files',
                 passed, f"total_files={body.get('total_files')}")
    return passed


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 5: Metrics endpoint
# ─────────────────────────────────────────────────────────────────────────────
def test_metrics():
    logger.info("\n=== TEST: Metrics Endpoint ===")
    m = get_metrics()
    logger.info(f"  Metrics: {json.dumps(m, indent=2)}")
    has_ai = 'ai_gateway' in m or 'pipeline' in m
    print_result('Metrics endpoint returns data', bool(m), str(list(m.keys())))
    return bool(m)


# ─────────────────────────────────────────────────────────────────────────────
# LOAD TEST: N concurrent uploads
# ─────────────────────────────────────────────────────────────────────────────
def load_test(n_jobs: int, concurrency: int = 10):
    logger.info(f"\n=== LOAD TEST: {n_jobs} jobs, {concurrency} concurrent ===")
    results = {'success': 0, 'fail': 0, 'busy': 0}
    lock = threading.Lock()
    times = []

    def do_upload(i):
        content = create_fake_pdf(random.randint(512, 2048))
        fname = f'load_{i}_{random.randint(1000,9999)}.pdf'
        t0 = time.perf_counter()
        try:
            r = upload_file(fname, content)
            elapsed = (time.perf_counter() - t0) * 1000
            with lock:
                times.append(elapsed)
                if r.status_code == 200:
                    results['success'] += 1
                elif r.status_code == 503:
                    results['busy'] += 1
                else:
                    results['fail'] += 1
        except Exception as e:
            with lock:
                results['fail'] += 1
            logger.warning(f"  Upload {i} failed: {e}")

    # Thread pool simulation
    batches = [list(range(i, min(i + concurrency, n_jobs)))
               for i in range(0, n_jobs, concurrency)]

    for batch in batches:
        threads = [threading.Thread(target=do_upload, args=(i,)) for i in batch]
        for t in threads: t.start()
        for t in threads: t.join()

    p50 = sorted(times)[len(times)//2] if times else 0
    p95 = sorted(times)[int(len(times)*0.95)] if times else 0
    p99 = sorted(times)[int(len(times)*0.99)] if times else 0

    logger.info(f"  Results: {results}")
    logger.info(f"  Latency – p50={p50:.0f}ms, p95={p95:.0f}ms, p99={p99:.0f}ms")
    logger.info(f"  Metrics post-load:\n{json.dumps(get_metrics(), indent=2)}")

    passed = results['fail'] == 0
    print_result(f'Load test {n_jobs} jobs (0 errors)',
                 passed, f"success={results['success']} busy={results['busy']}")
    return results


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO: Redis down simulation (log-only, requires manual Redis stop)
# ─────────────────────────────────────────────────────────────────────────────
def test_redis_down_guidance():
    logger.info("\n=== TEST: Redis Down Simulation (manual) ===")
    logger.info("  To simulate Redis down:")
    logger.info("  1. docker stop <redis-container>")
    logger.info("  2. POST /api/bulk-upload/  → expect 503")
    logger.info("  3. GET  /api/bulk-healthz/ → expect {redis: false, mode: SAFE or DOWN}")
    logger.info("  4. docker start <redis-container>")
    logger.info("  5. GET  /api/bulk-healthz/ → expect {redis: true}")
    logger.info("  Verifying current health state:")
    h = healthz()
    logger.info(f"  Current health: {h}")
    logger.info("  ✅ Redis down guidance printed. Run manually with Redis stopped.")


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO: Kafka down simulation
# ─────────────────────────────────────────────────────────────────────────────
def test_kafka_down_guidance():
    logger.info("\n=== TEST: Kafka Down Simulation (manual) ===")
    logger.info("  To simulate Kafka down:")
    logger.info("  1. docker stop <kafka-container>")
    logger.info("  2. POST /api/bulk-upload/  → expect 503")
    logger.info("  3. GET  /api/bulk-healthz/ → expect {kafka: false, mode: DEGRADED}")
    logger.info("  ✅ Kafka down guidance printed. Run manually with Kafka stopped.")


# ─────────────────────────────────────────────────────────────────────────────
# FULL SUITE
# ─────────────────────────────────────────────────────────────────────────────
TESTS = {
    'health':       test_health_endpoint,
    'idempotency':  test_idempotency,
    'retry_after':  test_retry_after_header,
    'large_batch':  test_large_batch,
    'metrics':      test_metrics,
    'redis_down':   test_redis_down_guidance,
    'kafka_down':   test_kafka_down_guidance,
    'load_1k':      lambda: load_test(1000, concurrency=20),
    'load_5k':      lambda: load_test(5000, concurrency=50),
    'load_10k':     lambda: load_test(10000, concurrency=100),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('test', nargs='?', choices=list(TESTS.keys()),
                        help='Run single test (default: all except load tests)')
    args = parser.parse_args()

    logger.info(f"=== Finpixe Pipeline Chaos Test Suite – {datetime.now().isoformat()} ===")
    logger.info(f"    Target: {BASE_URL}")

    if args.test:
        TESTS[args.test]()
    else:
        # Run all non-destructive tests by default
        for name in ['health', 'idempotency', 'retry_after', 'large_batch', 'metrics']:
            try:
                TESTS[name]()
            except Exception as e:
                print_result(name, False, f"Exception: {e}")
        logger.info("\nRun 'python chaos_test.py load_1k' for load testing.")
        logger.info("Run 'python chaos_test.py redis_down' for Redis failure guidance.")


if __name__ == '__main__':
    main()
