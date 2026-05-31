import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.views import is_save_eligible
from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails

print("=== INVOICE TEMP OCR RECORDS ===")
records = InvoiceTempOCR.objects.all().order_by('-id')[:20]
for r in records:
    # check save eligibility
    eligible, reason = is_save_eligible(r)
    v_name = None
    if r.extracted_data and isinstance(r.extracted_data, dict):
        v_name = r.extracted_data.get('header', {}).get('vendor_name')
    print(f"ID: {r.id} | Session: {r.upload_session_id} | Status: {r.status} | Val Status: {r.validation_status} | Vendor: {v_name} (ID: {r.vendor_id}) | Invoice No: {r.supplier_invoice_no} | Eligible: {eligible} ({reason}) | Error: {r.validation_message}")

print("\n=== SAVED VOUCHERS IN DB ===")
vouchers = VoucherPurchaseSupplierDetails.objects.all().order_by('-id')[:20]
for v in vouchers:
    print(f"ID: {v.id} | Vendor: {v.vendor_name} | Invoice No: {v.supplier_invoice_no} | Date: {v.date} | Input Type: {v.input_type}")
