import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

invoices = ['S058', 'S 058', 'S060', 'S 060', '4464/25-26']
for inv in invoices:
    records = InvoiceTempOCR.objects.filter(supplier_invoice_no__icontains=inv)
    print(f"Query '{inv}': found {records.count()} records")
    for r in records:
        print(f"  ID={r.id}, invoice_no={r.supplier_invoice_no}, status={r.status}, validation_status={r.validation_status}, vendor_status={r.vendor_status}, processed={r.processed}, is_primary={r.is_primary}, upload_session={r.upload_session_id}")

print("\nPending Purchase Queue rows:")
all_pp = PendingPurchase.objects.all()
print(f"Total rows in PendingPurchase: {all_pp.count()}")
for pp in all_pp:
    print(f"  ID={pp.id}, invoice_no={pp.invoice_number}, status={pp.pending_purchase_status}, source_row={pp.source_scan_row_id}")
