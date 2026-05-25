import os
import sys
import django

# Setup Django
sys.path.append(r"d:\ledger_report0.37\AI-accounting-0.03\backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounting.models_voucher_sales import VoucherSalesInvoiceDetails

try:
    voucher = VoucherSalesInvoiceDetails.objects.filter(sales_invoice_no="derft0000012345").first()
    if not voucher:
        print("Voucher derft0000012345 not found in DB.")
    else:
        print(f"Voucher ID: {voucher.id}")
        print(f"Voucher Name (Series): {voucher.voucher_name}")
        print(f"Sales Invoice No: {voucher.sales_invoice_no}")
        print(f"Customer: {voucher.customer_name} (ID: {voucher.customer_id})")
        print(f"Sales Order No: {voucher.sales_order_no}")
        print(f"GSTIN: {voucher.gstin}")
        print(f"Branch: {voucher.customer_branch}")
        
        print("\nItems:")
        for item in voucher.items.all():
            print(f"  - Item Code: {item.item_code}, Item Name: {item.item_name}, HSN: {item.hsn_sac}, Qty: {item.qty}, UOM: {item.uom}, Rate: {item.item_rate}, Ledger: {item.sales_ledger}")
            
except Exception as e:
    import traceback
    traceback.print_exc()
