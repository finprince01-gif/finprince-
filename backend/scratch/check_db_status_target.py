import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

session_id = "db78a89d-23a5-43f7-b75e-191656968085"
records = InvoiceTempOCR.objects.filter(upload_session_id=session_id)
print("=== Records in Session ===")
for r in records:
    print(f"ID={r.id}, invoice_no={r.supplier_invoice_no}, status={r.status}, validation_status={r.validation_status}, processed={r.processed}, is_primary={r.is_primary}")

print("\n=== Pending Purchase Queue entries for this session ===")
ppqs = PendingPurchase.objects.filter(scan_session_id=session_id)
for p in ppqs:
    print(f"ID={p.id}, invoice_no={p.invoice_number}, record_id={p.source_scan_row_id}")
