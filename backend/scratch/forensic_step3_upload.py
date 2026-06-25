"""
STEPS 3+4: Upload PDF using Django test client (bypasses auth password issue),
then poll API until terminal status, dump DB record and API response.
"""
import os, sys, json, time, uuid
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'

import django
django.setup()

from django.test import RequestFactory
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

User = get_user_model()
superuser = User.objects.filter(is_superuser=True).first()
print(f"Using superuser: {superuser.username} (email={superuser.email})")

PDF_PATH = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0006.pdf"

# ── Use DRF APIClient with force_authenticate (no password needed) ──
client = APIClient()
client.force_authenticate(user=superuser)
print("Authenticated via force_authenticate OK")

# ── UPLOAD ──
print(f"\nUploading {PDF_PATH} ...")
session_id = str(uuid.uuid4())
print(f"upload_session_id: {session_id}")

with open(PDF_PATH, 'rb') as f:
    upload_resp = client.post(
        '/api/ocr-staging/',
        {
            'files': f,
            'voucher_type': 'PURCHASE',
            'upload_type': 'BULK_SCAN',
            'upload_session_id': session_id
        },
        format='multipart'
    )

print(f"Upload HTTP: {upload_resp.status_code}")
if upload_resp.status_code not in (200, 201, 202):
    print(f"Upload failed: {upload_resp.content[:500]}")
    sys.exit(1)

upload_data = upload_resp.json()
print(f"Upload response: {json.dumps(upload_data, indent=2, default=str)[:800]}")

# Get session_id from response or use the one we sent
resp_session_id = (
    upload_data.get('upload_session_id') or 
    upload_data.get('session_id') or
    session_id
)
print(f"Polling with session_id: {resp_session_id}")

# ── POLL until terminal ──
print("\nPolling until terminal state (max 120s)...")
start = time.time()
final_resp_data = None
record_id = None

for attempt in range(60):
    time.sleep(2)
    poll_resp = client.get(
        '/api/ocr-staging/',
        {'upload_session_id': resp_session_id}
    )
    if poll_resp.status_code != 200:
        print(f"  Poll {attempt}: HTTP {poll_resp.status_code}")
        continue
    
    poll_data = poll_resp.json()
    status = poll_data.get('status') or poll_data.get('pipeline_status', '')
    rows = poll_data.get('data', [])
    
    if rows:
        row = rows[0]
        record_id = row.get('id')
        val_status = row.get('validationStatus') or row.get('validation_status')
        print(f"  Poll {attempt}: pipeline_status={status} id={record_id} validationStatus={val_status}")
        
        TERMINAL = {
            'DUPLICATE', 'NEED_TO_SAVE', 'GST_MISMATCH', 'VOUCHER_CREATED', 'ERROR',
            'DUPLICATE_INVOICE', 'DUPLICATE_IN_BATCH', 'NEED_VENDOR', 'REQUIRES_REVIEW'
        }
        TERMINAL_PIPELINE = {'FINALIZED', 'FAILED', 'ERROR', 'COMPLETED'}
        
        if status in TERMINAL_PIPELINE or val_status in TERMINAL:
            final_resp_data = poll_data
            print(f"\n  Terminal at attempt {attempt} ({time.time()-start:.1f}s)")
            break
    else:
        print(f"  Poll {attempt}: pipeline_status={status} rows=0")
        if status in {'FINALIZED', 'FAILED', 'ERROR', 'COMPLETED', 'EMPTY_SESSION_TERMINAL'}:
            final_resp_data = poll_data
            break
else:
    print(f"\n  [TIMEOUT] ({time.time()-start:.1f}s) - using last poll")
    final_resp_data = poll_data if 'poll_data' in dir() else None

# ── STEP 4: API Response ──
print("\n" + "=" * 80)
print("STEP 4 -- RAW API RESPONSE (final poll for this session)")
print("=" * 80)
if final_resp_data:
    rows = final_resp_data.get('data', [])
    print(f"Total rows in response: {len(rows)}")
    for row in rows:
        print(f"\n  id: {row.get('id')}")
        print(f"  status: {row.get('status')}")
        print(f"  validationStatus: {row.get('validationStatus')}")
        print(f"  validation_status: {row.get('validation_status')}")
        print(f"  voucher_status: {row.get('voucher_status')}")
        print(f"  vendor_status: {row.get('vendor_status')}")
        print(f"  item_status: {row.get('item_status')}")
        ext = row.get('extracted_data') or {}
        print(f"  extracted_data.gst_audit_trail: {json.dumps(ext.get('gst_audit_trail'))}")
        print(f"  extracted_data.gst_resolution: {ext.get('gst_resolution')}")
        print(f"  extracted_data keys: {sorted(ext.keys())}")
else:
    print("[NONE] No final data captured")

# ── STEP 3: DB Dump ──
print("\n" + "=" * 80)
print("STEP 3 -- DB RECORD DUMP (most recent record for this file_hash)")
print("=" * 80)

import hashlib
h = hashlib.sha256()
with open(PDF_PATH, 'rb') as f:
    for chunk in iter(lambda: f.read(65536), b''):
        h.update(chunk)
file_hash = h.hexdigest()

most_recent = InvoiceTempOCR.objects.filter(file_hash=file_hash).order_by('-id').first()
if most_recent:
    ext = most_recent.extracted_data or {}
    print(f"record.id: {most_recent.id}")
    print(f"record.status: {most_recent.status}")
    print(f"record.validation_status: {most_recent.validation_status}")
    print(f"record.vendor_status: {most_recent.vendor_status}")
    print(f"record.supplier_invoice_no: {most_recent.supplier_invoice_no}")
    print(f"record.upload_session_id: {most_recent.upload_session_id}")
    print(f"record.processed: {most_recent.processed}")
    print(f"record.extracted_data.keys(): {sorted(ext.keys())}")
    print(f"  gst_audit_trail: {json.dumps(ext.get('gst_audit_trail'), indent=2)}")
    print(f"  gst_resolution: {ext.get('gst_resolution')}")
    
    pp = PendingPurchase.objects.filter(source_scan_row_id=most_recent.id).first()
    if pp:
        print(f"\nPendingPurchase ID: {pp.id}")
        print(f"  voucher_status: {pp.voucher_status}")
        print(f"  vendor_status: {pp.vendor_status}")
        print(f"  item_status: {pp.item_status}")
        print(f"  pending_purchase_status: {pp.pending_purchase_status}")
    else:
        print("\nPendingPurchase: NONE linked")
else:
    print(f"[ERROR] No record found for file_hash {file_hash}")

print("\nDone.")
