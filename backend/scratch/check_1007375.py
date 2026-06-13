import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails

r = InvoiceTempOCR.objects.filter(id=1007375).first()
if r:
    print(f"record_id={r.id} inv={r.supplier_invoice_no} status={r.status} val={r.validation_status} processed={r.processed}")
from ocr_pipeline.pipeline import validate_and_process
r = InvoiceTempOCR.objects.filter(id=1007375).first()
if r:
    print(f"Before validate_and_process: supplier_invoice_no={r.supplier_invoice_no}, gstin={r.gstin}, branch={r.branch}")
    # Reset processed/validation_status to allow validation to run
    r.processed = False
    r.validation_status = 'PENDING'
    r.save()
    
    res = validate_and_process(r)
    print(f"validate_and_process result: {res}")
    
    r.refresh_from_db()
    print(f"After validate_and_process: supplier_invoice_no={r.supplier_invoice_no}, gstin={r.gstin}, branch={r.branch}")
    for field in r._meta.fields:
        val = getattr(r, field.name)
        print(f"{field.name} = {val}")





# Print all records in session d00ebe9b-2e76-4522-ac56-3237ba2a02bd
print("\n=== All records in session d00ebe9b-2e76-4522-ac56-3237ba2a02bd ===")
for rec in InvoiceTempOCR.objects.filter(upload_session_id="d00ebe9b-2e76-4522-ac56-3237ba2a02bd"):
    print(f"rec={rec.id} inv={rec.supplier_invoice_no} status={rec.status} val={rec.validation_status} processed={rec.processed}")
