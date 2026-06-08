import os, sys, django, hashlib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult
from ocr_pipeline.pipeline import get_canonical_export_record, get_ui_payload
from ocr_pipeline.forensic_merger import get_forensic_merger

rid = 1006819
record = InvoiceTempOCR.objects.get(id=rid)
db_results = InvoicePageResult.objects.filter(record_id=rid).values('page_number', 'canonical_payload', 'is_failed')
db_page_map = {res['page_number']: res['canonical_payload'] for res in db_results}

raw_pages = {str(p): db_page_map[p] for p in db_page_map}
pages_list = []
for p_idx, k in enumerate(sorted(raw_pages.keys(), key=int), start=1):
    payload_src = raw_pages[k]
    p = get_canonical_export_record(payload_src, tenant_id=record.tenant_id)
    p["_page_no"] = p_idx
    p["_physical_page_no"] = int(k)
    pages_list.append(p)

merger = get_forensic_merger()
groups_dict = merger.group_invoices(pages_list)

assembled_exports = []
for group_id, group_list in groups_dict.items():
    merged_group = merger.merge_group(group_list)
    assembled_exports.append(merged_group)

print(f"Total groups: {len(assembled_exports)}")
hashes = []
for idx, inv in enumerate(assembled_exports):
    ui_pay = get_ui_payload(inv)
    inv_no = str(ui_pay.get('invoice_no') or '').strip().upper()
    gstin = str(ui_pay.get('gstin') or '').strip().upper()
    total_val = str(ui_pay.get('total_invoice_value') or ui_pay.get('total_amount') or '0').strip()
    inv_date = str(ui_pay.get('invoice_date') or '').strip().upper()
    page_no = str(ui_pay.get('_page_no') or idx).strip()

    identity_string = f"{record.tenant_id}::{record.upload_session_id}::{record.id}::{inv_no}::{gstin}::{total_val}::{inv_date}::{page_no}"
    stable_hash = hashlib.sha256(identity_string.encode('utf-8')).hexdigest()
    print(f"Group {idx}: inv_no={inv_no}, gstin={gstin}, total_val={total_val}, page_no={page_no}, hash={stable_hash}")
    hashes.append(stable_hash)

# Check for duplicates in hashes list
import collections
dups = [item for item, count in collections.Counter(hashes).items() if count > 1]
print(f"Duplicates in current list: {dups}")
