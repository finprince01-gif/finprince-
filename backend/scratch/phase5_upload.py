"""
PHASE 5 + 6: Single invoice upload with full forensic tracking.
Records T0 (upload time), session_id, record_id for Phase 6 trace.
"""
import requests
import os
import json
import time
import uuid
from datetime import datetime, timezone

UPLOAD_FILE = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0006.pdf"
BASE_URL = "http://127.0.0.1:8000"
TENANT_ID = "2eda0ac6-6af2-493e-8792-bc973fe946b7"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzgyMTA1OTcxLCJpYXQiOjE3ODIxMDUwNzEsImp0aSI6ImQ4MmM1NTY5OGU2NzQ5ZTBhYzg3MTIxNmFjNzNhOTc2IiwidXNlcl9pZCI6IjkxIn0.XBlID8hHH6ZtiWkVi5UfRHsO1zXZenz6TpcF14SyV04"

session_id = str(uuid.uuid4())
T0 = datetime.now(timezone.utc)
T0_ts = time.time()

print("=" * 60)
print("PHASE 5 — SINGLE INVOICE UPLOAD")
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

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "X-Tenant-ID": TENANT_ID,
}

with open(UPLOAD_FILE, 'rb') as f:
    file_bytes = f.read()

files = {
    'files': (os.path.basename(UPLOAD_FILE), file_bytes, 'application/pdf'),
}
data = {
    'upload_session_id': session_id,
    'upload_type': 'PURCHASE',
    'tenant_id': TENANT_ID,
}

print(f"Sending POST /api/ocr-staging/ ...")
t_req_start = time.time()
try:
    resp = requests.post(
        f"{BASE_URL}/api/ocr-staging/",
        headers=headers,
        files=files,
        data=data,
        timeout=60,
    )
    t_req_end = time.time()
    print(f"HTTP Status: {resp.status_code}")
    print(f"Response time: {(t_req_end - t_req_start)*1000:.0f}ms")
    try:
        body = resp.json()
        print(f"Response body: {json.dumps(body, indent=2, default=str)[:2000]}")
    except Exception:
        print(f"Response text: {resp.text[:500]}")
except Exception as e:
    print(f"Upload ERROR: {e}")
    exit(1)

# Save forensic context for Phase 6
ctx = {
    'T0_iso': T0.isoformat(),
    'T0_ts': T0_ts,
    'session_id': session_id,
    'tenant_id': TENANT_ID,
    'file': UPLOAD_FILE,
    'http_status': resp.status_code,
    'response': resp.json() if resp.status_code < 400 else resp.text,
}
with open('scratch/phase5_context.json', 'w') as f:
    json.dump(ctx, f, indent=2, default=str)
print(f"\nContext saved: scratch/phase5_context.json")
print(f"Session ID for monitoring: {session_id}")
