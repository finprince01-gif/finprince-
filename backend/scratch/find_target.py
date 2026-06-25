"""
Find the right target: PENDING record with all 3 = ALREADY EXIST and staging intact.
"""
import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR

ALREADY_EXIST_VENDOR  = {'VENDOR_STATUS_EXISTING', 'ALREADY_EXIST', 'EXISTS'}
ALREADY_EXIST_ITEM    = {'ITEM_STATUS_EXISTING', 'ALREADY_EXIST', 'ALREADY EXIST'}
ALREADY_EXIST_VOUCHER = {'VOUCHER_STATUS_EXISTING', 'ALREADY_EXIST', 'ALREADY EXIST', 'VOUCHER_STATUS_NEW', 'NEED_TO_SAVE'}

print("Scanning for candidate records...")
for pp in PendingPurchase.objects.filter(pending_purchase_status='PENDING').order_by('-updated_at'):
    v = pp.vendor_status in ALREADY_EXIST_VENDOR
    i = pp.item_status in ALREADY_EXIST_ITEM
    ext = pp.extraction_payload or {}
    has_no_audit = 'gst_audit_trail' not in ext

    if v and i and has_no_audit:
        staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
        if staging:
            print(f"FOUND: PP id={pp.id} invoice={pp.invoice_number}")
            print(f"  vendor_status  : {pp.vendor_status}")
            print(f"  item_status    : {pp.item_status}")
            print(f"  voucher_status : {pp.voucher_status}")
            print(f"  staging.id     : {staging.id}")
            print(f"  staging.status : {staging.status}")
            print(f"  staging.processed : {staging.processed}")
            print(f"  staging.validation_status : {staging.validation_status}")
            s_ext = staging.extracted_data or {}
            print(f"  staging gst_audit_trail : {s_ext.get('gst_audit_trail') is not None}")
            print(f"  is_canonical_frozen : {s_ext.get('is_canonical_frozen')}")
            val_rev = s_ext.get('validation_revision')
            print(f"  validation_revision : {val_rev}")
            break
else:
    print("No matching PENDING record found. Listing all status combos:")
    for pp in PendingPurchase.objects.filter(pending_purchase_status='PENDING').order_by('-updated_at')[:10]:
        print(f"  PP {pp.id}: vendor={pp.vendor_status} item={pp.item_status} voucher={pp.voucher_status}")
