"""
Find records where vendor+item+voucher are ALL 'ALREADY EXIST'
but gst_audit_trail is MISSING — the exact NOT CHECKED symptom.
"""
import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR

ALREADY_EXIST_VENDOR  = {'VENDOR_STATUS_EXISTING', 'ALREADY_EXIST', 'EXISTS'}
ALREADY_EXIST_ITEM    = {'ITEM_STATUS_EXISTING', 'ALREADY_EXIST', 'ALREADY EXIST'}
ALREADY_EXIST_VOUCHER = {'VOUCHER_STATUS_EXISTING', 'ALREADY_EXIST', 'ALREADY EXIST'}

print("=" * 70)
print("RECORDS: vendor=ALREADY EXIST + item=ALREADY EXIST + voucher=ALREADY EXIST")
print("         => gst_audit_trail analysis")
print("=" * 70)

all_pp = PendingPurchase.objects.all().order_by('-updated_at')
matches = []
for pp in all_pp:
    v = pp.vendor_status in ALREADY_EXIST_VENDOR
    i = pp.item_status in ALREADY_EXIST_ITEM
    vc = pp.voucher_status in ALREADY_EXIST_VOUCHER
    if v and i and vc:
        matches.append(pp)

print(f"Found {len(matches)} records with ALL THREE = ALREADY EXIST\n")

for pp in matches[:5]:
    ext = pp.extraction_payload or {}
    audit = ext.get('gst_audit_trail')
    print(f"PP id={pp.id} invoice={pp.invoice_number}")
    print(f"  vendor_status  : {pp.vendor_status}")
    print(f"  item_status    : {pp.item_status}")
    print(f"  voucher_status : {pp.voucher_status}")
    print(f"  gst_audit_trail present: {audit is not None}")
    if audit:
        print(f"  gst_audit_trail.validation_status: {audit.get('validation_status')}")
    else:
        print(f"  extraction_payload keys: {list(ext.keys()) if ext else 'EMPTY'}")
    # Check staging
    staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
    if staging:
        s_audit = (staging.extracted_data or {}).get('gst_audit_trail')
        print(f"  [STAGING] gst_audit_trail present: {s_audit is not None}")
        print(f"  [STAGING] validation_status: {staging.validation_status}")
    print()

# Summary counts
no_audit = sum(1 for pp in matches if not (pp.extraction_payload or {}).get('gst_audit_trail'))
with_audit = len(matches) - no_audit
print(f"\nSUMMARY (vendor+item+voucher=ALREADY EXIST):")
print(f"  With gst_audit_trail     : {with_audit}")
print(f"  WITHOUT gst_audit_trail  : {no_audit}  ← these show NOT CHECKED")
