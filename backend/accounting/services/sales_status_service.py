from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from ..models_voucher_sales import VoucherSalesInvoiceDetails, VoucherSalesPaymentDetails
from ..models_voucher_receipt import ReceiptVoucherItem

def update_sales_invoice_payment_status(tenant_id, invoice_id):
    """
    Recalculates the payment progress of a sales invoice and updates its status.
    Uses quantitative tracking (payment_received, payment_balance).
    """
    try:
        with transaction.atomic():
            # Get the invoice and its payment details
            try:
                invoice = VoucherSalesInvoiceDetails.objects.select_related('payment_details').get(
                    id=invoice_id, 
                    tenant_id=tenant_id
                )
            except (VoucherSalesInvoiceDetails.DoesNotExist, ValueError):
                # If invoice_id is a string (e.g., from old-style reference_id), find by sales_invoice_no
                invoice = VoucherSalesInvoiceDetails.objects.select_related('payment_details').get(
                    sales_invoice_no=invoice_id, 
                    tenant_id=tenant_id
                )

            payment_details = invoice.payment_details
            if not payment_details:
                # Should not happen but safety first
                payment_details = VoucherSalesPaymentDetails.objects.create(invoice=invoice, tenant_id=tenant_id)

            payable_amount = Decimal(str(payment_details.payment_payable or 0))

            # Sum all received amounts across all ReceiptVoucherItems referencing this invoice
            # reference_id in ReceiptVoucherItem matches the sales invoice No or the string ID
            receipt_total = ReceiptVoucherItem.objects.filter(
                tenant_id=tenant_id,
                reference_id__in=[str(invoice.id), str(invoice.sales_invoice_no)]
            ).aggregate(total=Sum('received_amount'))['total'] or Decimal('0.00')

            payment_details.payment_received = receipt_total
            payment_details.payment_balance = payable_amount - receipt_total
            payment_details.save(update_fields=['payment_received', 'payment_balance'])

            # Update Header Status
            if receipt_total >= payable_amount > 0:
                invoice.status = 'received'
            elif receipt_total > 0:
                invoice.status = 'partially received'
            else:
                # Keep existing if no receipts
                pass
            
            invoice.save(update_fields=['status'])
            
            print(f"!!! Success: Updated {invoice.sales_invoice_no} (Recv: {receipt_total}, Bal: {payment_details.payment_balance})")
            return True
            
    except Exception as e:
        print(f"!!! Status Sync Failed: {str(e)}")
        return False
