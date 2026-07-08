import os
import sys
import django

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

import datetime
from core.models import Branch
from accounting.models import MasterLedger
from accounting.models_voucher_sales import (
    VoucherSalesInvoiceDetails, VoucherSalesItems, VoucherSalesPaymentDetails,
    VoucherSalesDispatchDetails
)

def create_june_b2cl():
    tenant = Branch.objects.first()
    if not tenant:
        print("No tenant found")
        return

    tenant_id = tenant.id
    
    b2cl_cust, _ = MasterLedger.objects.get_or_create(
        tenant_id=tenant_id,
        name="Delhi Customer (B2CL)",
        defaults={
            'group': 'Sundry Debtors',
            'category': 'Assets',
            'gstin': '',
            'state': 'Delhi',
            'registration_type': 'Unregistered'
        }
    )

    inv_no = "INV-26-JUN-B2CL-999"
    date = datetime.date(2026, 6, 15)
    taxable = 300000
    
    # 18% IGST (Interstate)
    igst = taxable * 0.18
    total = taxable + igst
    
    # Delete if exists
    VoucherSalesInvoiceDetails.objects.filter(tenant_id=tenant_id, sales_invoice_no=inv_no).delete()

    invoice = VoucherSalesInvoiceDetails.objects.create(
        tenant_id=tenant_id,
        date=date,
        sales_invoice_no=inv_no,
        customer_name=b2cl_cust.name,
        gstin="",
        bill_to="Delhi Address",
        state_type="other",
        tax_type="other_state"
    )

    VoucherSalesItems.objects.create(
        tenant_id=tenant_id,
        invoice=invoice,
        item_name="Bulk Electronics",
        qty=1,
        uom="Nos",
        item_rate=taxable,
        taxable_value=taxable,
        igst=igst, cgst=0, cess=0,
        invoice_value=total
    )

    VoucherSalesPaymentDetails.objects.create(
        tenant_id=tenant_id,
        invoice=invoice,
        payment_taxable_value=taxable,
        payment_igst=igst,
        payment_cgst=0,
        payment_sgst=0,
        payment_invoice_value=total
    )

    print(f"Successfully created B2CL invoice {inv_no} for {date}!")

if __name__ == "__main__":
    create_june_b2cl()
