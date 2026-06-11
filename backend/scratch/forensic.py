import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot
from pending_purchases.models import PendingPurchase

r = InvoiceTempOCR.objects.last()

User = get_user_model()
user = User.objects.filter(tenant_id=r.tenant_id).first()
if not user:
    user = User.objects.first()

client = APIClient()
client.force_authenticate(user=user)

print("\n=== FORENSIC PERSISTENCE TEST ===")
print(f"Target Record ID    : {r.id}")
print(f"Upload Session ID   : {r.upload_session_id}")
print(f"Current InvoiceNo   : {r.supplier_invoice_no}")

old_vendor = r.extracted_data.get('vendor_name') if r.extracted_data else None
print(f"\nBEFORE PATCH:")
print(f"  InvoiceTempOCR vendor_name : {old_vendor}")

p_before = PendingPurchase.objects.filter(source_scan_row_id=r.id).first()
print(f"  PendingPurchase vendor_name : {p_before.vendor_name if p_before else 'NOT FOUND'}")

# Check snapshot before patch
snap = FinalizedSnapshot.objects.filter(session_id=r.upload_session_id).first()
if snap:
    import gzip
    try:
        raw = open(snap.s3_key.replace('snapshots/local', r'C:\108\AI-accounting-0.03\backend\media\bulk_pipeline\snapshots\local').replace('/', '\\'), 'rb').read()
        snap_before = json.loads(gzip.decompress(raw))
        rows = snap_before.get('data', [])
        print(f"  Snapshot rows count : {len(rows)}")
        if rows:
            print(f"  Snapshot row[0] id={rows[0].get('id')} file_hash={rows[0].get('file_hash')} invoice_no={rows[0].get('invoice_no')} vendor_name={rows[0].get('vendor_name')}")
    except Exception as e:
        print(f"  Snapshot read error: {e}")

TEST_VENDOR = 'FINAL FORENSIC TEST VENDOR'

payload = {
    'extracted_data': {
        'vendor_name': TEST_VENDOR,
        'invoice_no': r.supplier_invoice_no,   # Keep same invoice_no to isolate vendor_name test
        'sections': {
            'supplier_details': {
                'vendor_name': TEST_VENDOR,
                'supplier_invoice_no': r.supplier_invoice_no,
            }
        }
    }
}

print(f"\nPATCHING vendor_name to: {TEST_VENDOR}")
res = client.patch(f'/api/ocr-staging/{r.file_hash}/', data=payload, format='json')
print(f"PATCH Status: {res.status_code}")
if res.status_code != 200:
    print(f"PATCH Error: {res.data}")

# --- VERIFY ---
r.refresh_from_db()
db_vendor = r.extracted_data.get('vendor_name') if r.extracted_data else 'N/A'

p_after = PendingPurchase.objects.filter(source_scan_row_id=r.id).first()
pp_vendor = p_after.vendor_name if p_after else 'NOT FOUND'

# Check snapshot after patch
snap.refresh_from_db()
snap_vendor = 'NOT FOUND IN SNAPSHOT'
try:
    raw = open(snap.s3_key.replace('snapshots/local', r'C:\108\AI-accounting-0.03\backend\media\bulk_pipeline\snapshots\local').replace('/', '\\'), 'rb').read()
    snap_after = json.loads(gzip.decompress(raw))
    rows_after = snap_after.get('data', [])
    for row in rows_after:
        if row.get('id') == r.id or row.get('invoice_no') == r.supplier_invoice_no:
            snap_vendor = row.get('vendor_name')
            break
except Exception as e:
    snap_vendor = f'ERROR: {e}'

# Check GET grid response
res_grid = client.get(f'/api/ocr-staging/?upload_session_id={r.upload_session_id}')
grid_vendor = 'NOT FOUND IN GRID'
if res_grid.status_code == 200:
    grid_data = res_grid.data.get('data', []) if isinstance(res_grid.data, dict) else []
    for row in grid_data:
        if isinstance(row, dict) and row.get('id') == r.id:
            grid_vendor = row.get('vendor_name')
            break
    if grid_vendor == 'NOT FOUND IN GRID' and grid_data:
        grid_vendor = f'Not matched by ID; first row vendor_name={grid_data[0].get("vendor_name") if isinstance(grid_data[0], dict) else grid_data[0]}'

# Pending purchases grid
res_pending = client.get('/api/pending-purchases/?status=PENDING')
pending_grid_vendor = 'NOT FOUND'
if res_pending.status_code == 200:
    results = res_pending.data.get('results', []) if isinstance(res_pending.data, dict) else res_pending.data
    for row in (results or []):
        if isinstance(row, dict) and row.get('source_scan_row_id') == r.id:
            pending_grid_vendor = row.get('vendor_name')
            break

print(f"\nAFTER PATCH:")
print(f"  InvoiceTempOCR.vendor_name     : {db_vendor}")
print(f"  PendingPurchase.vendor_name    : {pp_vendor}")
print(f"  FinalizedSnapshot.vendor_name  : {snap_vendor}")
print(f"  Purchase Upload Grid vendor    : {grid_vendor}")
print(f"  Pending Purchases Grid vendor  : {pending_grid_vendor}")

print("\n=== RESULT ===")
passed = db_vendor == TEST_VENDOR and snap_vendor == TEST_VENDOR and grid_vendor == TEST_VENDOR
if passed:
    print("✅ ALL CHECKS PASSED - Edit persists correctly in all views")
else:
    print("❌ SOME CHECKS FAILED:")
    if db_vendor != TEST_VENDOR:
        print(f"  DB:       EXPECTED={TEST_VENDOR} GOT={db_vendor}")
    if snap_vendor != TEST_VENDOR:
        print(f"  SNAPSHOT: EXPECTED={TEST_VENDOR} GOT={snap_vendor}")
    if grid_vendor != TEST_VENDOR:
        print(f"  GRID:     EXPECTED={TEST_VENDOR} GOT={grid_vendor}")
