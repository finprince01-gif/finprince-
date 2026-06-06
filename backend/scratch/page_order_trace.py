import django, os, sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from ocr_pipeline.repository import InvoiceTempOCR
from ocr_pipeline.models import InvoicePageResult

runs = {
    'Run1_record': '1005981',
    'Run2_record': '1005994',
}

print("=" * 70)
print("InvoicePageResult page_number ordering (source of truth for physical page)")
print("=" * 70)

for run, record_id in runs.items():
    pages = InvoicePageResult.objects.filter(record_id=record_id).order_by('page_number')
    print(f"\n{run} (record={record_id}) — by page_number:")
    for p in pages:
        inv_no = (p.canonical_payload or {}).get('invoice_no', '')
        gstin = (p.canonical_payload or {}).get('gstin', '')
        print(f"  page={p.page_number:>2} created={p.created_at.strftime('%H:%M:%S.%f')} invoice_no={inv_no!r} gstin={gstin!r}")

print("\n" + "=" * 70)
print("InvoiceTempOCR created_at ordering (what grouping.py uses!)")
print("=" * 70)

# Get the upload session IDs from BulkInvoiceJob
from vouchers.models import BulkInvoiceJob
jobs = {
    'Run1': BulkInvoiceJob.objects.get(id=734),
    'Run2': BulkInvoiceJob.objects.get(id=735),
}

TARGET_INV = {'089/25-26', 'SWE/25-26/0487', 'SWE/25-26/0609'}

for run_name, job in jobs.items():
    session_id = job.upload_session_id
    records = InvoiceTempOCR.objects.filter(
        upload_session_id=session_id,
        processed=False
    ).order_by('created_at', 'id')
    
    print(f"\n{run_name} (session={session_id[:8]}...) — DB enumeration order:")
    for idx, r in enumerate(records):
        marker = " *** TARGET ***" if (r.supplier_invoice_no or '').strip() in TARGET_INV else ""
        print(f"  idx={idx+1:>2} id={r.id} created={r.created_at.strftime('%H:%M:%S.%f')} invoice_no={r.supplier_invoice_no!r} gstin={r.gstin!r}{marker}")
