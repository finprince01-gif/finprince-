import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_sales import VoucherSalesInvoiceDetails
from accounting.serializers_voucher_sales import VoucherSalesInvoiceDetailsSerializer

invoice = VoucherSalesInvoiceDetails.objects.order_by('-created_at').first()
if not invoice:
    print("No invoices found")
else:
    serializer = VoucherSalesInvoiceDetailsSerializer(invoice)
    data = serializer.data
    items = data.get('items', [])
    print(f"Invoice ID: {invoice.id}, voucher_name: {data.get('voucher_name')}, sales_invoice_no: {data.get('sales_invoice_no')}")
    print(f"Items in serializer output: {len(items)}")
    for item in items:
        print(json.dumps(dict(item), indent=2, default=str))
