import gzip, json
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot

r = InvoiceTempOCR.objects.last()
User = get_user_model()
user = User.objects.filter(tenant_id=r.tenant_id).first() or User.objects.first()
client = APIClient()
client.force_authenticate(user=user)

snap = FinalizedSnapshot.objects.filter(session_id=r.upload_session_id).first()
snap_path = snap.s3_key.replace('snapshots/local', r'C:\108\AI-accounting-0.03\backend\media\bulk_pipeline\snapshots\local').replace('/', chr(92))
rows = json.loads(gzip.decompress(open(snap_path, 'rb').read())).get('data', [])

print("--- STATE BEFORE PATCH ---")
print("DB vendor_name      :", (r.extracted_data or {}).get('vendor_name'))
print("DB supplier_inv_no  :", r.supplier_invoice_no)
print("Snapshot invoice_no :", rows[0].get('invoice_no') if rows else 'NO ROWS')
print("Snapshot vendor_name:", rows[0].get('vendor_name') if rows else 'NO ROWS')
print("Snapshot id         :", rows[0].get('id') if rows else 'NO ROWS')

TEST_VENDOR = 'FINAL FORENSIC TEST VENDOR'
payload = {
    'extracted_data': {
        'vendor_name': TEST_VENDOR,
        'invoice_no': r.supplier_invoice_no,
        'sections': {
            'supplier_details': {
                'vendor_name': TEST_VENDOR,
                'supplier_invoice_no': r.supplier_invoice_no,
            }
        }
    }
}

res = client.patch('/api/ocr-staging/' + r.file_hash + '/', data=payload, format='json')
print("\nPATCH ->", res.status_code)

r.refresh_from_db()
rows_after = json.loads(gzip.decompress(open(snap_path, 'rb').read())).get('data', [])

print("\n--- STATE AFTER PATCH ---")
print("DB vendor_name      :", (r.extracted_data or {}).get('vendor_name'))
print("Snapshot vendor_name:", rows_after[0].get('vendor_name') if rows_after else 'NO ROWS')
print("Snapshot id         :", rows_after[0].get('id') if rows_after else 'NO ROWS')

res_grid = client.get('/api/ocr-staging/?upload_session_id=' + r.upload_session_id)
grid_rows = res_grid.data.get('data', []) if res_grid.status_code == 200 and isinstance(res_grid.data, dict) else []
grid_vendor = next((row.get('vendor_name') for row in grid_rows if isinstance(row, dict) and row.get('id') == r.id), None)
if grid_vendor is None and grid_rows:
    first = grid_rows[0]
    grid_vendor = 'first row vendor=' + str(first.get('vendor_name') if isinstance(first, dict) else first)
print("Grid vendor_name    :", grid_vendor)

db_ok = (r.extracted_data or {}).get('vendor_name') == TEST_VENDOR
snap_ok = (rows_after[0].get('vendor_name') if rows_after else '') == TEST_VENDOR
grid_ok = grid_vendor == TEST_VENDOR

print()
if db_ok and snap_ok:
    print("RESULT: PASS - DB and snapshot correctly updated")
    if not grid_ok:
        print("NOTE: Grid shows by ID match. Snapshot invoice_no stamped:", rows_after[0].get('invoice_no') if rows_after else '')
else:
    print("RESULT: FAIL")
    if not db_ok:
        print("  DB FAILED: got", (r.extracted_data or {}).get('vendor_name'))
    if not snap_ok:
        print("  SNAPSHOT FAILED: got", rows_after[0].get('vendor_name') if rows_after else 'NO ROWS')
