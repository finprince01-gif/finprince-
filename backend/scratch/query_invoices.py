import os
import sys
import django

# Setup Django
sys.path.append(r"d:\ledger_report0.37\AI-accounting-0.03\backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounting.models import Voucher, SalesInvoice
from accounting.models_voucher_sales import VoucherSalesInvoiceDetails

try:
    print(f"Total Voucher records: {Voucher.objects.count()}")
    for v in Voucher.objects.filter(type='sales'):
        print(f"  - ID: {v.id}, No: {v.voucher_number}, Party: {v.party}, Source: {v.source}, Ref ID: {v.reference_id}")
        
    print(f"\nTotal SalesInvoice records: {SalesInvoice.objects.count()}")
    for s in SalesInvoice.objects.all():
        print(f"  - ID: {s.id}, No: {s.invoice_number}")
        
    print(f"\nTotal VoucherSalesInvoiceDetails records: {VoucherSalesInvoiceDetails.objects.count()}")
    for v in VoucherSalesInvoiceDetails.objects.all():
        print(f"  - ID: {v.id}, No: {v.sales_invoice_no}, Voucher ID: {v.voucher_id}")
except Exception as e:
    import traceback
    traceback.print_exc()
