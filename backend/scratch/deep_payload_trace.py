"""
Deep forensic trace: compare canonical_payload GSTIN fields
for the split invoice pages across Run 1 vs Run 2.
"""
import django, os, sys, json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from ocr_pipeline.models import InvoicePageResult

TARGET_PAGES = {5, 6, 7, 8, 11, 12}  # physical pages of the 3 multi-page invoices

runs = {
    'Run1': '1005981',
    'Run2': '1005994',
    'Run3': '1006007',
}

GSTIN_FIELDS = ['gstin', 'vendor_gstin', 'raw_gstin', 'canonical_gstin']

for run, record_id in runs.items():
    print(f"\n{'='*60}")
    print(f"{run} (record={record_id})")
    print(f"{'='*60}")
    pages = InvoicePageResult.objects.filter(
        record_id=record_id,
        page_number__in=TARGET_PAGES
    ).order_by('page_number')
    for p in pages:
        payload = p.canonical_payload or {}
        inv_no = payload.get('invoice_no', '')
        print(f"\n  Page {p.page_number}: invoice_no={inv_no!r}")
        for field in GSTIN_FIELDS:
            val = payload.get(field)
            print(f"    {field:<20} = {val!r}")
        # Also check upload_session_id and record_id stored inside payload
        print(f"    upload_session_id    = {payload.get('upload_session_id')!r}")
        print(f"    record_id (payload)  = {payload.get('record_id')!r}")
        print(f"    _page_no (payload)   = {payload.get('_page_no')!r}")
        print(f"    _physical_page_no    = {payload.get('_physical_page_no')!r}")
        # Check _raw_text presence (needed for continuation detection)
        raw_text = payload.get('_pdf_ocr_text') or payload.get('_raw_text') or ''
        print(f"    _raw_text length     = {len(raw_text)}")
        items = payload.get('items', [])
        print(f"    items count          = {len(items)}")
        for itm in items:
            qty = itm.get('qty') or itm.get('quantity') or 0
            rate = itm.get('rate') or 0
            print(f"      item: qty={qty} rate={rate} name={itm.get('item_name')!r}")
