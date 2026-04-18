from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from ..models_voucher_sales import VoucherSalesInvoiceDetails, VoucherSalesPaymentDetails
from ..models import PendingTransaction

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
                payment_details = VoucherSalesPaymentDetails.objects.create(invoice=invoice, tenant_id=tenant_id)

            # --- ANCHOR: Use invoice value minus advance as the fixed starting point ---
            payable_anchor = Decimal(str(payment_details.payment_invoice_value or 0)) - Decimal(str(payment_details.payment_advance or 0))

            from ..models import TransactionAllocation, AdvanceAllocation, VoucherAdvanceAdjustment
            search_ids = [str(invoice.id), str(invoice.sales_invoice_no)]
            
            p_total = PendingTransaction.objects.filter(
                tenant_id=tenant_id,
                reference_id__in=search_ids
            ).aggregate(total=Sum('allocated_amount'))['total'] or Decimal('0.00')

            a_total = AdvanceAllocation.objects.filter(
                tenant_id=tenant_id,
                reference_id__in=search_ids
            ).aggregate(total=Sum('allocated_amount'))['total'] or Decimal('0.00')

            t_total = TransactionAllocation.objects.filter(
                tenant_id=tenant_id,
                reference_id__in=search_ids
            ).aggregate(total=Sum('allocated_amount'))['total'] or Decimal('0.00')
            
            # Sum from newest table
            v_total = VoucherAdvanceAdjustment.objects.filter(
                tenant_id=tenant_id,
                target_voucher_id__in=[invoice.id, getattr(invoice, 'voucher_id', None)]
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

            receipt_total = p_total + t_total + a_total + v_total

            payment_details.payment_received = receipt_total
            payment_details.payment_balance = payable_anchor - receipt_total
            payment_details.save(update_fields=['payment_received', 'payment_balance'])

            # Update Header Status
            if receipt_total >= payable_anchor and payable_anchor > 0:
                invoice.status = 'received'
            elif receipt_total > 0:
                invoice.status = 'partially received'
            else:
                # Keep existing (Due/Not Due) 
                pass
            
            invoice.save(update_fields=['status'])
            
            print(f"!!! Success: Updated {invoice.sales_invoice_no} (Recv: {receipt_total}, Bal: {payment_details.payment_balance})")
            return True
            
    except Exception as e:
        print(f"!!! Status Sync Failed: {str(e)}")
        return False
