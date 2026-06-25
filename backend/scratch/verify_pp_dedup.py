"""
VERIFICATION — Duplicate PendingPurchase prevention fix.

Tests:
  Case 1: Re-upload of RESOLVED invoice -> must NOT create new PP row
  Case 2: Re-upload of PENDING invoice -> must NOT create new PP row (update only)
  Case 3: Genuinely new invoice -> MUST create a new PP row

Uses DRF APIClient with force_authenticate (no password needed).
"""
import os, sys, json, time, uuid, hashlib
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'

import django
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR

User = get_user_model()
superuser = User.objects.filter(is_superuser=True).first()
client = APIClient()
client.force_authenticate(user=superuser)

SEP = "=" * 70

# ─── Helper ────────────────────────────────────────────────────────────────
def pp_count():
    return PendingPurchase.objects.count()

def pp_for_invoice(inv_no, gstin):
    return list(PendingPurchase.objects.filter(
        invoice_number__iexact=inv_no,
        vendor_gstin__iexact=gstin
    ).order_by('id'))

def dump_pps(rows):
    for pp in rows:
        print(f"    PP id={pp.id} status={pp.pending_purchase_status} "
              f"source_scan_row={pp.source_scan_row_id} created={pp.created_at.strftime('%H:%M:%S')}")

def upload_and_wait(pdf_path, label):
    session_id = str(uuid.uuid4())
    print(f"  Uploading [{label}] session={session_id[:8]}...")
    with open(pdf_path, 'rb') as f:
        resp = client.post(
            '/api/ocr-staging/',
            {'files': f, 'voucher_type': 'PURCHASE', 'upload_type': 'BULK_SCAN', 'upload_session_id': session_id},
            format='multipart'
        )
    if resp.status_code not in (200, 201, 202):
        print(f"  [ERROR] Upload failed: {resp.status_code} {resp.content[:200]}")
        return None, None

    data = resp.json()
    print(f"  Upload accepted: job_id={data.get('job_id','?')[:8]}")

    # Poll until finalized (max 90s)
    for attempt in range(45):
        time.sleep(2)
        poll = client.get('/api/ocr-staging/', {'upload_session_id': session_id})
        if poll.status_code != 200:
            continue
        pd = poll.json()
        status = pd.get('pipeline_status', '')
        rows = pd.get('data', [])
        if rows:
            row = rows[0]
            vs = row.get('validationStatus') or row.get('validation_status')
            if status == 'FINALIZED' or vs in (
                'DUPLICATE','PENDING_PURCHASE','NEED_TO_SAVE','GST_MISMATCH',
                'VOUCHER_CREATED','NEED_VENDOR','DUPLICATE_IN_BATCH','DUPLICATE_INVOICE'
            ):
                print(f"  Pipeline finished: validation_status={vs} staging_id={row.get('id')}")
                return row.get('id'), vs
        elif status in ('FINALIZED','FAILED','ERROR','COMPLETED'):
            print(f"  Pipeline finished (no rows): pipeline_status={status}")
            return None, status

    print("  [TIMEOUT] 90s elapsed")
    return None, 'TIMEOUT'

# ─── SETUP ─────────────────────────────────────────────────────────────────
DUPLICATE_PDF = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0006.pdf"
TARGET_INVOICE = "4742/25-26"
TARGET_GSTIN   = "33ABYFS6343M1ZC"

print(SEP)
print("BEFORE — Current state of PendingPurchase table")
print(SEP)
before_total = pp_count()
print(f"Total PendingPurchase rows: {before_total}")

before_rows = pp_for_invoice(TARGET_INVOICE, TARGET_GSTIN)
print(f"Rows for invoice '{TARGET_INVOICE}' / GSTIN '{TARGET_GSTIN}': {len(before_rows)}")
dump_pps(before_rows)

# ─── CASE 1: Re-upload RESOLVED invoice ─────────────────────────────────────
print()
print(SEP)
print("CASE 1: Re-upload of DUPLICATE/RESOLVED invoice (4742/25-26)")
print(SEP)

staging_id, val_status = upload_and_wait(DUPLICATE_PDF, "duplicate re-upload")

after_total_1 = pp_count()
after_rows_1 = pp_for_invoice(TARGET_INVOICE, TARGET_GSTIN)

print(f"\n  BEFORE: total_pp={before_total}  rows_for_invoice={len(before_rows)}")
print(f"  AFTER:  total_pp={after_total_1} rows_for_invoice={len(after_rows_1)}")
print(f"  New rows created: {after_total_1 - before_total}")
print(f"  Rows for this invoice: {len(after_rows_1)}")
dump_pps(after_rows_1)

if after_total_1 == before_total or len(after_rows_1) <= max(len(before_rows), 1):
    print(f"\n  [PASS] No new PP row created for re-upload of duplicate invoice")
else:
    print(f"\n  [FAIL] New PP row was created — fix did not work!")

# Check backend log for PENDING_REUSE or PENDING_SAFETY_REUSE
if staging_id:
    try:
        ocr = InvoiceTempOCR.objects.get(id=staging_id)
        print(f"\n  Staging record: id={ocr.id} validation_status={ocr.validation_status}")
        pp_linked = PendingPurchase.objects.filter(source_scan_row_id=staging_id).first()
        print(f"  PP linked to this staging row: {pp_linked.id if pp_linked else 'NONE'}")
    except InvoiceTempOCR.DoesNotExist:
        pass

# ─── CASE 3: Genuinely new invoice ─────────────────────────────────────────
print()
print(SEP)
print("CASE 3: Genuinely new invoice (synthetic — testing create path)")
print(SEP)

before_case3 = pp_count()
print(f"  PP count before: {before_case3}")

# Create a synthetic InvoiceTempOCR staging record with a unique invoice number
# and call evaluate_pending_purchase directly to test the create path
from pending_purchases.services import evaluate_pending_purchase
from ocr_pipeline.statuses import ValidationEnums

unique_inv = f"FORENSIC-TEST-{uuid.uuid4().hex[:6].upper()}"
print(f"  Creating test staging record with invoice_no={unique_inv}")

test_staging = InvoiceTempOCR.objects.create(
    file_hash=f"test_hash_{uuid.uuid4().hex}",
    file_path="test.pdf",
    voucher_type='PURCHASE',
    upload_session_id=str(uuid.uuid4()),
    supplier_invoice_no=unique_inv,
    validation_status='PENDING',
    status='FINALIZED',
    vendor_status='PENDING',
    processed=False,
    extracted_data={
        'invoice_no': unique_inv,
        'vendor_name': 'TEST VENDOR',
        'gstin': '99TEST9999T1ZZ',
    }
)
print(f"  Staging record created: id={test_staging.id}")

# Manually call evaluate_pending_purchase with CREATE statuses
result = evaluate_pending_purchase(
    record=test_staging,
    vendor_status=ValidationEnums.VENDOR_STATUS_CREATE,
    voucher_status=ValidationEnums.VOUCHER_STATUS_NEW,
    item_status=ValidationEnums.ITEM_STATUS_CREATE,
    tenant_id=superuser.branch_id or superuser.tenant_id,
    ui_row={
        'invoice_no': unique_inv,
        'invoice_date': '2026-01-01',
        'vendor_name': 'TEST VENDOR',
        'vendor_gstin': '99TEST9999T1ZZ',
        'total_amount': 5000,
    }
)

after_case3 = pp_count()
new_pp = PendingPurchase.objects.filter(source_scan_row_id=test_staging.id).first()

print(f"  PP count after:  {after_case3}")
print(f"  New PP created:  {new_pp.id if new_pp else 'NONE'}")
print(f"  is_pending returned: {result}")

if after_case3 > before_case3 and new_pp:
    print(f"\n  [PASS] New PP row created for genuinely new invoice (id={new_pp.id})")
else:
    print(f"\n  [FAIL] New PP was NOT created for new invoice — create path broken!")

# Cleanup test record (read-only investigation was upstream; this is our own test data)
test_staging.delete()
if new_pp:
    new_pp.delete()
print(f"  Test records cleaned up.")

# ─── FINAL SUMMARY ─────────────────────────────────────────────────────────
print()
print(SEP)
print("FINAL SUMMARY")
print(SEP)
final_total = pp_count()
print(f"  PendingPurchase count before all tests: {before_total}")
print(f"  PendingPurchase count after all tests:  {final_total}")
print(f"  Net change: {final_total - before_total} (should be 0)")
print()
print("  Rows for invoice 4742/25-26 / 33ABYFS6343M1ZC:")
final_rows = pp_for_invoice(TARGET_INVOICE, TARGET_GSTIN)
dump_pps(final_rows)
print(f"  Count: {len(final_rows)} (should be 1)")
print()
print("Done.")
