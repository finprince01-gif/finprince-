import os
import django
import sys

# Setup django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_sales import VoucherSalesInvoiceDetails, VoucherSalesItems
from accounting.models import Voucher

try:
    invoice = VoucherSalesInvoiceDetails.objects.get(id=21)
    print("VoucherSalesInvoiceDetails ID: 21")
    print(f"  date: {invoice.date}")
    print(f"  sales_invoice_no: {invoice.sales_invoice_no}")
    print(f"  voucher_name: {invoice.voucher_name}")
    print(f"  customer_name: {invoice.customer_name}")
    print(f"  customer_branch: {invoice.customer_branch}")
    print(f"  gstin: {invoice.gstin}")
    print(f"  sales_order_no: {invoice.sales_order_no}")
    print(f"  voucher_id: {invoice.voucher_id}")
    
    print("\nItems:")
    for item in invoice.items.all():
        print(f"  item_code: {item.item_code}, item_name: {item.item_name}, hsn_sac: {item.hsn_sac}, qty: {item.qty}, rate: {item.item_rate}, sales_ledger: {item.sales_ledger}")
        
    print("\nGeneric Voucher:")
    if invoice.voucher_id:
        v = Voucher.objects.get(id=invoice.voucher_id)
        print(f"  id: {v.id}")
        print(f"  voucher_number: {v.voucher_number}")
        print(f"  reference_id: {v.reference_id}")
        print(f"  source: {v.source}")
except Exception as e:
    print("Error:", e)
