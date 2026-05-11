import requests
import time
import concurrent.futures
import statistics
import os
import uuid
import argparse

# Configuration
API_BASE = "http://localhost:8000/api"
UPLOAD_ENDPOINT = f"{API_BASE}/bulk-upload/"
STATUS_ENDPOINT = f"{API_BASE}/bulk-status/"
TEST_FILE = "backend/tests/test.pdf"

def simulate_user(user_id, file_path):
    """Simulates a single user uploading and polling a job."""
    session_id = str(uuid.uuid4())
    t_start = time.time()
    
    # 1. Upload
    try:
        with open(file_path, 'rb') as f:
            files = {'files': (os.path.basename(file_path), f, 'application/pdf')}
            data = {'upload_session_id': session_id}
            response = requests.post(UPLOAD_ENDPOINT, files=files, data=data)
            
        if response.status_code != 200:
            return {'user_id': user_id, 'status': 'UPLOAD_FAILED', 'error': response.text}
        
        job_id = response.json().get('job_id')
        upload_time = time.time() - t_start
    except Exception as e:
        return {'user_id': user_id, 'status': 'UPLOAD_ERROR', 'error': str(e)}

    # 2. Polling
    polls = 0
    max_polls = 60 # 5 minutes at 5s interval
    while polls < max_polls:
        try:
            status_resp = requests.get(f"{STATUS_ENDPOINT}{job_id}/")
            if status_resp.status_code == 200:
                status_data = status_resp.json()
                if status_data.get('completed'):
                    total_time = time.time() - t_start
                    return {
                        'user_id': user_id,
                        'job_id': job_id,
                        'status': 'SUCCESS',
                        'upload_time': upload_time,
                        'total_time': total_time,
                        'polls': polls
                    }
            polls += 1
            time.sleep(5)
        except Exception as e:
            return {'user_id': user_id, 'job_id': job_id, 'status': 'POLL_ERROR', 'error': str(e)}
            
    return {'user_id': user_id, 'job_id': job_id, 'status': 'TIMEOUT'}

def run_benchmark(concurrency=10, total_requests=50):
    print(f"--- STARTING BENCHMARK: Concurrency={concurrency}, Total={total_requests} ---")
    
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(simulate_user, i, TEST_FILE) for i in range(total_requests)]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
            print(".", end="", flush=True)
    
    print("\n--- RESULTS ---")
    successes = [r for r in results if r['status'] == 'SUCCESS']
    failures = [r for r in results if r['status'] != 'SUCCESS']
    
    print(f"Total: {total_requests}")
    print(f"Success: {len(successes)}")
    print(f"Failure: {len(failures)}")
    
    if successes:
        total_times = [r['total_time'] for r in successes]
        upload_times = [r['upload_time'] for r in successes]
        
        print(f"Min Total Time: {min(total_times):.2f}s")
        print(f"Max Total Time: {max(total_times):.2f}s")
        print(f"Avg Total Time: {statistics.mean(total_times):.2f}s")
        print(f"P95 Total Time: {statistics.quantiles(total_times, n=20)[18]:.2f}s")
        print(f"P99 Total Time: {statistics.quantiles(total_times, n=100)[98]:.2f}s")
        
        # Throughput: pages per minute
        # Each test file is 1 page (mocked)
        total_pages = len(successes)
        benchmark_duration = max(total_times) if total_times else 1
        ppm = (total_pages / benchmark_duration) * 60
        print(f"Throughput: {ppm:.2f} pages/min")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--total", type=int, default=50)
    args = parser.parse_args()
    
    if not os.path.exists(TEST_FILE):
        print(f"Error: Test file {TEST_FILE} not found.")
    else:
        run_benchmark(args.concurrency, args.total)
