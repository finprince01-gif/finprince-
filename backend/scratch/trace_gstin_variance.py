import os, sys, django, gzip, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import FinalizedSnapshot, InvoiceTempOCR, InvoicePageResult
from core.storage import StorageService

TARGET_INV = 'SWE/25-26/0487'
records = [1005401, 1005418, 1005432]

for rid in records:
    rec = InvoiceTempOCR.objects.filter(id=rid).first()
    session = rec.upload_session_id
    snap = FinalizedSnapshot.objects.filter(session_id=session).first()
    raw = gzip.decompress(StorageService().get_file(snap.s3_key))
    data = json.loads(raw.decode('utf-8'))
    for inv in data.get('data', []):
        inv_no = inv.get('invoice_no', '')
        if TARGET_INV in str(inv_no):
            print(f"=== record={rid} session={session[:8]} ===")
            print(f"  invoice_no      : {inv.get('invoice_no')}")
            print(f"  gstin           : {inv.get('gstin')}")
            print(f"  raw_gstin       : {inv.get('raw_gstin')}")
            print(f"  canonical_gstin : {inv.get('canonical_gstin')}")
            print(f"  source_pages    : {inv.get('_source_pages')}")
            print(f"  physical_page   : {inv.get('_physical_page_no')}")
            # print first 300 chars of raw_text for the page
            raw_text = str(inv.get('_raw_text', ''))[:400]
            print(f"  raw_text_snippet: {raw_text}")
            print()
