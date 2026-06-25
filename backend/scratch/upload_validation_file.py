import requests
import os
import json
import time
import uuid
from datetime import datetime, timezone

UPLOAD_FILE = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0006.pdf"
BASE_URL = "http://127.0.0.1:8000"
TENANT_ID = "2eda0ac6-6af2-493e-8792-bc973fe946b7"

username = "admin"
email = "admin@budstech.com"
passwords = ["admin123", "Sprint3Val@2026"]

session_id = str(uuid.uuid4())
T0 = datetime.now(timezone.utc)

print("=" * 60)
print("UPLOADING VERIFICATION INVOICE")
print("=" * 60)
print(f"T0 (upload time): {T0.isoformat()}")
print(f"Session ID: {session_id}")
print(f"File: {UPLOAD_FILE}")
print(f"File exists: {os.path.exists(UPLOAD_FILE)}")
print(f"File size: {os.path.getsize(UPLOAD_FILE):,} bytes")
print()

if not os.path.exists(UPLOAD_FILE):
    print("ERROR: File not found!")
    exit(1)

# Step 1: Login to get token
session = requests.Session()
login_url = f"{BASE_URL}/api/auth/login/"

token = None
for password in passwords:
    payload = {"username": username, "email": email, "password": password}
    print(f"Authenticating as {username} with password '{password}'...")
    resp = session.post(login_url, json=payload, timeout=30)
    if resp.status_code == 200:
        token_data = resp.json()
        token = token_data.get("access") or token_data.get("token")
        print("Authentication successful!")
        break
    else:
        print(f"Failed with {resp.status_code}: {resp.text}")

if not token:
    print("ERROR: Could not authenticate with any password!")
    exit(1)

headers = {
    "Authorization": f"Bearer {token}",
    "X-Tenant-ID": TENANT_ID,
}

# Step 2: Upload the file
with open(UPLOAD_FILE, 'rb') as f:
    file_bytes = f.read()

files = {
    'files': (os.path.basename(UPLOAD_FILE), file_bytes, 'application/pdf'),
}
data = {
    'upload_session_id': session_id,
    'voucher_type': 'PURCHASE',
    'upload_type': 'SPRINT3_VALIDATION',
    'tenant_id': TENANT_ID,
}

print(f"Uploading file to /api/ocr-staging/...")
t_req_start = time.time()
resp = session.post(
    f"{BASE_URL}/api/ocr-staging/",
    headers=headers,
    files=files,
    data=data,
    timeout=60,
)
t_req_end = time.time()
print(f"HTTP Status: {resp.status_code}")
print(f"Response time: {(t_req_end - t_req_start)*1000:.0f}ms")

if resp.status_code not in (200, 201, 202):
    print(f"Upload failed: {resp.text}")
    exit(1)

result = resp.json()
print("Upload response body:")
print(json.dumps(result, indent=2))

job_id = result.get("job_id") or result.get("id")
record_id = result.get("record_id") or result.get("id")

print(f"\nJob ID: {job_id}")
print(f"Record ID: {record_id}")

# Save context for inspection
ctx = {
    'T0_iso': T0.isoformat(),
    'session_id': session_id,
    'tenant_id': TENANT_ID,
    'file': UPLOAD_FILE,
    'http_status': resp.status_code,
    'job_id': job_id,
    'record_id': record_id,
}
with open('scratch/verification_upload_context.json', 'w') as f:
    json.dump(ctx, f, indent=2, default=str)

# Step 3: Poll status
print("\nPolling job status...")
status_url = f"{BASE_URL}/api/ocr-job-status/{job_id}/"
TERMINAL_STATES = {"COMPLETED", "FAILED", "ERROR", "HYDRATION_READY", "VOUCHER_CREATED", "SUCCESS", "CANCELLED"}

poll_count = 0
for i in range(120): # Poll for up to 10 minutes
    resp = session.get(status_url, timeout=15)
    if resp.status_code == 200:
        data = resp.json()
        status = (data.get("status") or data.get("pipeline_status", data.get("state", "UNKNOWN"))).upper()
        progress = data.get("progress", data.get("completion_pct", 0))
        print(f"  [Poll {i+1}] status={status} progress={progress}%")
        
        if status in TERMINAL_STATES or data.get("terminal"):
            print(f"\nJob completed with status: {status}")
            print(json.dumps(data, indent=2, default=str))
            break
    else:
        print(f"  [Poll {i+1}] Error response: {resp.status_code}")
    
    time.sleep(5)

print("\nFinished polling.")
