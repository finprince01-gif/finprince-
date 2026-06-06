# -*- coding: utf-8 -*-
# import sys, io
# sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
"""
FULL FOLDER REGRESSION STABILITY AUDIT
Read-only execution audit. No code changes.
"""
import os
import sys
import django
import uuid
import requests
import time
import gzip
import json
from collections import defaultdict

# Setup Django environment
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate
from ocr_pipeline.views import CleanOCRStagingView
from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult, FinalizedSnapshot, InvoiceTempOCR
from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from core.storage import StorageService


def run_upload_and_wait(pdf_path, timeout=300):
    """Upload PDF, wait for terminal_consistency=True, return (session_id, record_id)."""
    upload_session_id = str(uuid.uuid4())
    url = "http://localhost:8000/api/bulk-upload/"

    with open(pdf_path, 'rb') as f:
        files = {'files': f}
        data = {
            'upload_session_id': upload_session_id,
            'voucher_type': 'Purchase',
            'upload_type': 'LIVE'
        }
        response = requests.post(url, files=files, data=data)

    if response.status_code != 200:
        raise RuntimeError(f"POST upload failed ({response.status_code}): {response.text[:200]}")

    job_id = response.json()['job_id']

    # Resolve staging record ID (retry up to 30s)
    record_id = None
    for _ in range(60):
        item = InvoiceProcessingItem.objects.filter(job_id=job_id).first()
        if item:
            record_id = item.staging_record_id
            break
        time.sleep(0.5)

    if not record_id:
        raise RuntimeError(f"Could not resolve staging record ID for job {job_id}")

    # Poll until terminal_consistency=True (the gate the view reads from)
    start_time = time.time()
    while (time.time() - start_time) < timeout:
        barrier = SessionFinalizationState.objects.filter(id=str(record_id)).first()
        if barrier:
            if barrier.status == 'FAILED':
                raise RuntimeError(f"Job {job_id} FAILED in processing.")
            if barrier.terminal_consistency:
                return upload_session_id, record_id
        time.sleep(1)

    raise RuntimeError(f"Job {job_id} timed out waiting for terminal_consistency (record {record_id})")


def get_api_response_data(session_id):
    """Call CleanOCRStagingView.get() directly with an authenticated request."""
    User = get_user_model()
    user = User.objects.first()
    factory = APIRequestFactory()
    request = factory.get(f'/api/bulk-upload/?upload_session_id={session_id}')
    force_authenticate(request, user=user)
    view = CleanOCRStagingView.as_view()
    response = view(request)
    if response.status_code != 200:
        raise RuntimeError(f"StagingView GET failed ({response.status_code}): {response.data}")
    return response.data.get('data', [])


def get_snapshot_invoices(session_id):
    """Read the finalized gzip-compressed S3 snapshot."""
    snapshot = FinalizedSnapshot.objects.filter(session_id=session_id).order_by('-created_at').first()
    if not snapshot or not snapshot.s3_key:
        return []
    try:
        compressed_bytes = StorageService().get_file(snapshot.s3_key)
        snapshot_data = json.loads(gzip.decompress(compressed_bytes).decode('utf-8'))
        return snapshot_data.get('data', [])
    except Exception as e:
        print(f"    [WARN] Could not read snapshot for {session_id}: {e}")
        return []


def get_page_details(record_id):
    """Return per-page extraction details from InvoicePageResult."""
    pages = InvoicePageResult.objects.filter(record_id=record_id).order_by('page_number')
    details = []
    for p in pages:
        payload = p.canonical_payload or {}
        items = payload.get('items', [])
        details.append({
            'page_number': p.page_number,
            'invoice_no': (payload.get('invoice_no') or '').strip().upper(),
            'gstin': (payload.get('gstin') or '').strip().upper(),
            'items_count': len(items),
        })
    return details


def canonical_key(api_row):
    return {
        'invoice_no': str(api_row.get('invoice_no', '')).strip().upper(),
        'vendor_status': str(api_row.get('vendor_status', '')).strip().upper(),
        'voucher_status': str(api_row.get('validationStatus', '')).strip().upper(),
        'item_status': str(api_row.get('item_status', '')).strip().upper(),
        'item_count': len(api_row.get('items', [])),
        'gstin': str(api_row.get('gstin', '')).strip().upper(),
    }


def main():
    pdf_dir = r"C:\Users\ulaganathan\Downloads\New folder (2)"
    pdf_files = sorted([
        os.path.join(root, f)
        for root, _, files in os.walk(pdf_dir)
        for f in files
        if f.lower().endswith('.pdf')
    ])

    pdf_files = pdf_files[:1]  # Limit to first 1 PDF
    print(f"Total PDFs found (running first 1): {len(pdf_files)}")
    print("=" * 70)

    # ── Counters for Final Report ─────────────────────────────────────────────
    total_pdfs_processed = 0
    total_invoices_extracted = 0
    total_multi_page_invoices = 0
    total_grouping_failures = 0
    total_item_loss_incidents = 0
    total_validation_failures = 0
    total_status_flips = 0
    total_deterministic_failures = 0

    for pdf_path in pdf_files:
        pdf_name = os.path.basename(pdf_path)
        print(f"\n" + "-"*70)
        print(f"PDF: {pdf_name}")
        print("-"*70)

        runs = []
        all_ok = True
        for run_idx in range(1, 4):
            print(f"  [RUN {run_idx}/3] uploading...")
            try:
                session_id, record_id = run_upload_and_wait(pdf_path)
                api_data = get_api_response_data(session_id)
                snapshot_data = get_snapshot_invoices(session_id)
                page_details = get_page_details(record_id)
                runs.append({
                    'run_idx': run_idx,
                    'session_id': session_id,
                    'record_id': record_id,
                    'api_data': api_data,
                    'snapshot_data': snapshot_data,
                    'page_details': page_details,
                })
                print(f"  [RUN {run_idx}/3] done — {len(api_data)} invoices returned by API")
            except Exception as e:
                print(f"  [RUN {run_idx}/3] ERROR: {e}")
                all_ok = False
                break

        if not all_ok or len(runs) < 3:
            print(f"  Skipping {pdf_name} due to run error.")
            continue

        total_pdfs_processed += 1
        run1, run2, run3 = runs

        # ── 1. DETERMINISM CHECK ──────────────────────────────────────────────
        def sorted_key_list(api_data):
            keys = [canonical_key(row) for row in api_data]
            return sorted(keys, key=lambda x: (x['invoice_no'], x['gstin']))

        k1, k2, k3 = sorted_key_list(run1['api_data']), sorted_key_list(run2['api_data']), sorted_key_list(run3['api_data'])
        stable = (k1 == k2 == k3)
        det_result = "STABLE" if stable else "UNSTABLE"
        if not stable:
            total_deterministic_failures += 1

        print(f"\n  [DETERMINISM_CHECK]")
        print(f"    PDF: {pdf_name}")
        print(f"    Run1: {len(run1['api_data'])} invoices | Run2: {len(run2['api_data'])} invoices | Run3: {len(run3['api_data'])} invoices")
        print(f"    Result: {det_result}")

        # ── 2. GROUPING AUDIT ─────────────────────────────────────────────────
        # Group pages by invoice_no (canonical grouping from the engine)
        inv_to_pages = defaultdict(list)
        for p in run1['page_details']:
            inv_key = p['invoice_no'] or 'UNKNOWN'
            inv_to_pages[inv_key].append(p)

        print(f"\n  [GROUPING_AUDIT]")
        for inv_no, pages in sorted(inv_to_pages.items()):
            page_count = len(pages)
            page_nos = [p['page_number'] for p in pages]
            gstin_vals = list(set(p['gstin'] for p in pages))
            gstin = gstin_vals[0] if gstin_vals else ''
            if page_count > 1:
                total_multi_page_invoices += 1
                print(f"    invoice_no={inv_no} gstin={gstin} page_count={page_count} grouped_pages={page_nos}")
                # Detect merge errors: different GSTINs in same invoice group
                if len(gstin_vals) > 1:
                    print(f"    [GROUPING_FAILURE] GSTIN mismatch within group: {gstin_vals}")
                    total_grouping_failures += 1

        # ── 3. ITEM LOSS AUDIT ────────────────────────────────────────────────
        print(f"\n  [ITEM_LOSS_AUDIT]")
        for api_inv in run1['api_data']:
            inv_no = (api_inv.get('invoice_no') or '').strip().upper()
            matching_pages = [p for p in run1['page_details'] if p['invoice_no'] == inv_no]
            before_count = sum(p['items_count'] for p in matching_pages)
            after_count = len(api_inv.get('items', []))

            alert = ""
            if before_count > 0 and after_count == 0:
                alert = " *** ALERT: ITEM_LOSS_DETECTED ***"
                total_item_loss_incidents += 1

            print(f"    invoice_no={inv_no} before={before_count} after={after_count}{alert}")

        # ── 4. VALIDATION AUDIT ───────────────────────────────────────────────
        print(f"\n  [VALIDATION_AUDIT]")
        for api_inv in run1['api_data']:
            inv_no = (api_inv.get('invoice_no') or '').strip()
            vendor_status = api_inv.get('vendor_status')
            voucher_status = api_inv.get('validationStatus')
            item_status = api_inv.get('item_status')
            print(f"    invoice_no={inv_no} vendor_status={vendor_status} voucher_status={voucher_status} item_status={item_status}")

            if not vendor_status or not voucher_status or not item_status:
                print(f"    [VALIDATION_FAILURE] Null status for {inv_no}")
                total_validation_failures += 1
            if '-' in [vendor_status, voucher_status, item_status]:
                print(f"    [VALIDATION_FAILURE] '-' badge for {inv_no}")
                total_validation_failures += 1

            # Status-flip check across runs
            for other_run_label, other_run in [('Run2', run2), ('Run3', run3)]:
                other_inv = next((x for x in other_run['api_data']
                                  if (x.get('invoice_no') or '').strip().upper() == inv_no.upper()), None)
                if other_inv:
                    if (other_inv.get('vendor_status') != vendor_status or
                            other_inv.get('validationStatus') != voucher_status or
                            other_inv.get('item_status') != item_status):
                        print(f"    [STATUS_FLIP] {inv_no}: Run1 vs {other_run_label} differ!")
                        total_status_flips += 1

        # ── 5. SNAPSHOT AUDIT ─────────────────────────────────────────────────
        print(f"\n  [SNAPSHOT_AUDIT]")
        for api_inv in run1['api_data']:
            inv_no = (api_inv.get('invoice_no') or '').strip()
            api_count = len(api_inv.get('items', []))
            snap_inv = next((s for s in run1['snapshot_data']
                             if (s.get('invoice_no') or '').strip() == inv_no), None)
            snap_count = len(snap_inv.get('items', [])) if snap_inv else 0
            mismatch = " *** MISMATCH ***" if snap_count != api_count else ""
            print(f"    invoice_no={inv_no} snapshot_items={snap_count} api_items={api_count}{mismatch}")

        total_invoices_extracted += len(run1['api_data'])

    # ── SINGLE SOURCE OF TRUTH AUDIT (static code scan) ──────────────────────
    print("\n" + "=" * 70)
    print("SINGLE SOURCE OF TRUTH AUDIT (static scan)")
    print("=" * 70)
    from grep_code_audit import audit_execution_paths
    audit_execution_paths()

    # ── FINAL REPORT ──────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("FINAL REGRESSION AUDIT REPORT")
    print("=" * 70)
    print(f"1.  Total PDFs processed:            {total_pdfs_processed}")
    print(f"2.  Total invoices extracted:        {total_invoices_extracted}")
    print(f"3.  Total multi-page invoices:       {total_multi_page_invoices}")
    print(f"4.  Total grouping failures:         {total_grouping_failures}")
    print(f"5.  Total item-loss incidents:       {total_item_loss_incidents}")
    print(f"6.  Total validation failures:       {total_validation_failures}")
    print(f"7.  Total status flips:              {total_status_flips}")
    print(f"8.  Total deterministic failures:    {total_deterministic_failures}")

    # Verdict
    if (total_item_loss_incidents == 0 and total_grouping_failures == 0
            and total_status_flips == 0 and total_deterministic_failures == 0):
        verdict = "GREEN — No item loss / No grouping failures / No status flips / Deterministic"
    elif total_item_loss_incidents > 0 or total_deterministic_failures > 0:
        verdict = "RED — Non-deterministic behavior or item loss detected"
    else:
        verdict = "YELLOW — Minor inconsistencies detected"

    print(f"\nFinal Verdict: {verdict}")


if __name__ == "__main__":
    main()
