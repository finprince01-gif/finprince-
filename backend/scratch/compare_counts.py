import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

unresolved_staging = InvoiceTempOCR.objects.filter(
    processed=True,
    validation_status__in=['NEED_VENDOR', 'NEED_ITEM', 'NEED_TO_SAVE', 'PENDING', 'PENDING_PURCHASE']
)

print(f"Total Unresolved Staging Rows in InvoiceTempOCR: {unresolved_staging.count()}")
for r in unresolved_staging:
    print(f"  Staging Row ID={r.id}, status={r.status}, validation_status={r.validation_status}, processed={r.processed}")

active_queue = PendingPurchase.objects.filter(pending_purchase_status='PENDING')
print(f"\nTotal Active Rows in PendingPurchase queue: {active_queue.count()}")
for q in active_queue:
    print(f"  Queue ID={q.id}, source_row={q.source_scan_row_id}, invoice_no={q.invoice_number}, vendor={q.vendor_status}, item={q.item_status}, validation_status={q.voucher_status}")
