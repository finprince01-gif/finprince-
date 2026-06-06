import django, os, sys, json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from ocr_pipeline.models import InvoicePageResult

records = {
    'Run1': '1005981',
    'Run2': '1005994',
    'Run3': '1006007',
}

TARGET_INVOICES = {'089/25-26', 'SWE/25-26/0487', 'SWE/25-26/0609'}

for run, record_id in records.items():
    print(f"\n{'='*60}")
    print(f"{run} (record={record_id})")
    print(f"{'='*60}")
    pages = InvoicePageResult.objects.filter(record_id=record_id).order_by('page_number')
    for p in pages:
        payload = p.canonical_payload or {}
        inv_no = str(payload.get('invoice_no', '')).strip()
        gstin = str(payload.get('gstin', '')).strip()
        items_count = len(payload.get('items', []))
        group_key = payload.get('_group_key', 'N/A')
        group_id = payload.get('_group_id', 'N/A')
        if inv_no.upper() in {x.upper() for x in TARGET_INVOICES}:
            print(f"  Page {p.page_number:>2} | invoice_no={inv_no!r:<20} | gstin={gstin!r:<22} | items={items_count} | group_key={group_key!r} | group_id={group_id!r}")
