import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.views import get_save_eligible_rows, get_pending_purchase_eligible_rows

# Let's check 1006946 if it exists
try:
    r = InvoiceTempOCR.objects.get(id=1006946)
    print(f"Record 1006946: invoice={r.supplier_invoice_no}, status={r.status}, processed={r.processed}, validation_status={r.validation_status}")
    save_el = get_save_eligible_rows(r.upload_session_id, r.tenant_id)
    pend_el = get_pending_purchase_eligible_rows(r.upload_session_id, r.tenant_id)
    print("Save el:", [x[0].id for x in save_el])
    print("Pend el:", [x[0].id for x in pend_el])
except Exception as e:
    print("Error:", e)
