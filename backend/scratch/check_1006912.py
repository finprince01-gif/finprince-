import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

print("Checking record 1006912...")
try:
    rec = InvoiceTempOCR.objects.get(id=1006912)
    print(f"Record found! id={rec.id}")
    print(f"  status={rec.status}")
    print(f"  processed={rec.processed}")
    print(f"  validation_status={rec.validation_status}")
    print(f"  vendor_status={rec.vendor_status}")
    print(f"  vendor_id={rec.vendor_id}")
    print(f"  supplier_invoice_no={rec.supplier_invoice_no}")
    print(f"  gstin={rec.gstin}")
    print(f"  extracted_data keys: {list(rec.extracted_data.keys()) if rec.extracted_data else None}")
    if rec.extracted_data:
        print(f"  extracted_data items status: {rec.extracted_data.get('item_status')}")
        print(f"  extracted_data is_canonical_frozen: {rec.extracted_data.get('is_canonical_frozen')}")
        print(f"  extracted_data validation_revision: {rec.extracted_data.get('validation_revision')}")
        
    # Check if in PendingPurchase
    pps = PendingPurchase.objects.filter(source_scan_row_id=1006912)
    print(f"PendingPurchase rows: {pps.count()}")
    for pp in pps:
        print(f"  pp id={pp.id}, status={pp.pending_purchase_status}, vendor_status={pp.vendor_status}, item_status={pp.item_status}, voucher_status={pp.voucher_status}")
except InvoiceTempOCR.DoesNotExist:
    print("Record 1006912 NOT found in InvoiceTempOCR!")
except Exception as e:
    print(f"Error: {e}")
