import os
import django
import decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_sales import VoucherSalesInvoiceDetails
from accounting.models_voucher_receipt import ReceiptVoucherItem

def debug_invoice(inv_no):
    inv = VoucherSalesInvoiceDetails.objects.filter(sales_invoice_no=inv_no).first()
    if not inv:
        print(f"Invoice {inv_no} not found")
        return
    
    pd = inv.payment_details
    print(f"--- Invoice: {inv.sales_invoice_no} (ID: {inv.id}) ---")
    print(f"Status: {inv.status}")
    if pd:
        print(f"PD: Received={pd.payment_received}, Balance={pd.payment_balance}")
        print(f"PD: Invoice Value={pd.payment_invoice_value}, Advance={pd.payment_advance}, Payable={pd.payment_payable}")
    else:
        print("PD: Missing")

    items = ReceiptVoucherItem.objects.filter(reference_id__in=[str(inv.id), inv.sales_invoice_no])
    print(f"Receipt Items Count: {items.count()}")
    for i in items:
        print(f" - ID: {i.id}, Ref: {i.reference_id}, Recv: {i.received_amount}, Voucher: {i.voucher.voucher_number}")

if __name__ == "__main__":
    debug_invoice("INV000131")
