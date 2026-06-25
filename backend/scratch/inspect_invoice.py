import django, os, sys, json
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

def inspect():
    # Only records >= 1007730
    records = InvoiceTempOCR.objects.filter(id__gte=1007730).order_by('id')
    records = list(records)
    print(f"Found {len(records)} records with ID >= 1007730")
    for r in records:
        print("=" * 80)
        print(f"ID: {r.id}")
        print(f"Supplier Invoice No: {r.supplier_invoice_no}")
        print(f"Status: {r.status}")
        print(f"Validation Status: {r.validation_status}")
        print(f"Processed: {r.processed}")
        
        # Check in extracted_data
        ext_data = r.extracted_data or {}
        print(f"Extracted data keys: {list(ext_data.keys())}")
        
        # Extract specific keys
        gst_audit_trail = ext_data.get('gst_audit_trail')
        gst_resolution = ext_data.get('gst_resolution')
        diff_amount = None
        if gst_audit_trail:
            diff_amount = gst_audit_trail.get('difference_amount')
        
        print(f"gst_audit_trail: {json.dumps(gst_audit_trail, indent=2)}")
        print(f"gst_resolution: {gst_resolution}")
        print(f"difference_amount: {diff_amount}")
        print(f"validation_warnings: {ext_data.get('validation_warnings')}")
        print(f"validation_revision: {ext_data.get('validation_revision')}")
        
        # Check if PendingPurchase contains this source_scan_row_id
        pp_query = PendingPurchase.objects.filter(source_scan_row_id=r.id)
        print(f"PendingPurchase count matching source_scan_row_id={r.id}: {pp_query.count()}")
        for pp in pp_query:
            print(f"  PendingPurchase ID: {pp.id}")
            print(f"  PendingPurchase Status: {pp.pending_purchase_status}")
            print(f"  Vendor Status: {pp.vendor_status}")
            print(f"  Item Status: {pp.item_status}")
            print(f"  Voucher Status: {pp.voucher_status}")
            
            # Print other keys/attributes if they exist
            pp_keys = [field.name for field in pp._meta.get_fields() if not field.is_relation]
            print(f"  PP fields:")
            for pk in pp_keys:
                v = getattr(pp, pk)
                if pk in ['extraction_payload', 'review_payload']:
                    # Just print keys or snippet to avoid massive output
                    if isinstance(v, dict):
                        print(f"    {pk}: dict with keys {list(v.keys())}")
                    else:
                        print(f"    {pk}: {v}")
                else:
                    print(f"    {pk}: {v}")

if __name__ == "__main__":
    inspect()
