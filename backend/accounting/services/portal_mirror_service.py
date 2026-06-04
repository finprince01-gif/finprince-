import logging
import json
import re
from datetime import date, timedelta
from decimal import Decimal
from django.db import transaction, models
from vendors.models import VendorTransaction, VendorMasterBasicDetail
from customerportal.database import CustomerTransaction, CustomerMasterCustomer, CustomerMasterCustomerTermsCondition
from accounting.models import AdvanceAllocation, PendingTransaction, TransactionAllocation

logger = logging.getLogger(__name__)

def mirror_purchase_to_portal(purchase_header):
    """
    Mirror a purchase voucher to the Vendor Portal.
    purchase_header: VoucherPurchaseSupplierDetails instance
    """
    try:
        from .sales_status_service import update_sales_invoice_payment_status
        
        tenant_id = purchase_header.tenant_id
        vendor = VendorMasterBasicDetail.objects.filter(
            tenant_id=tenant_id, 
            id=purchase_header.vendor_basic_detail_id
        ).first()

        if not vendor:
            # Fallback to vendor_name lookup if ID not linked
            vendor = VendorMasterBasicDetail.objects.filter(
                tenant_id=tenant_id,
                vendor_name__iexact=str(purchase_header.vendor_name).strip()
            ).first()

        if not vendor:
            return

        payment_details = purchase_header.payment_details if hasattr(purchase_header, 'payment_details') else None
        total_amt = Decimal(str(payment_details.payment_invoice_value if payment_details else 0))
        
        # Determine status. 'Unpaid' is base for purchases.
        # Mirroring as 'Received' if total is 0 (unlikely) or for consistency with portal labels
        tx_status = 'Received' if total_amt == 0 else 'Unpaid'

        v_num = purchase_header.purchase_voucher_no or purchase_header.supplier_invoice_no

        VendorTransaction.objects.update_or_create(
            tenant_id=tenant_id,
            vendor_id=vendor.id,
            transaction_number=v_num,
            transaction_type='purchase',
            defaults={
                'transaction_date': purchase_header.date,
                'amount': total_amt,
                'total_amount': total_amt,
                'status': tx_status,
                'reference_number': v_num,
                'reference_type': 'invoice',
                'is_advance': False,
                'notes': getattr(purchase_header, 'voucher_name', None) or "Purchase Invoice",
                'ledger_name': vendor.vendor_name or "Vendor"
            }
        )
    except Exception as e:
        logger.error(f"Portal Mirror Sync Error (Purchase): {e}")

def mirror_sales_to_portal(sales_header):
    """
    Mirror a sales invoice to the Customer Portal.
    sales_header: VoucherSalesInvoiceDetails instance
    """
    try:
        tenant_id = sales_header.tenant_id
        customer = CustomerMasterCustomer.objects.filter(
            tenant_id=tenant_id, 
            id=sales_header.customer_id
        ).first()

        if not customer and sales_header.customer_name:
             customer = CustomerMasterCustomer.objects.filter(
                tenant_id=tenant_id, 
                customer_name__iexact=str(sales_header.customer_name).strip()
            ).first()

        if not customer:
            return

        payment_details = sales_header.payment_details if hasattr(sales_header, 'payment_details') else None
        total_amt = Decimal(str(payment_details.payment_invoice_value if payment_details else 0))

        # 1. Mirror the Invoice header itself
        CustomerTransaction.objects.update_or_create(
            tenant_id=tenant_id,
            transaction_number=sales_header.sales_invoice_no,
            transaction_type='invoice',
            customer_id=customer.id,
            defaults={
                'transaction_date': sales_header.date,
                'total_amount': total_amt,
                'amount': total_amt,
                'payment_status': sales_header.status or 'Unpaid',
                'reference_number': sales_header.sales_invoice_no,
                'notes': sales_header.voucher_name or "Sales Invoice",
            }
        )

        # 2. Mirror Advance Adjustments
        if payment_details and payment_details.payment_advance and float(payment_details.payment_advance) > 0:
            # Idempotency: Remove existing mirrored advance adjustments for this invoice
            CustomerTransaction.objects.filter(
                tenant_id=tenant_id,
                customer_id=customer.id,
                transaction_type='RECEIPT',
                transaction_number__contains=f"-ADJ{sales_header.id}I"
            ).delete()

            adv_refs_raw = payment_details.advance_references
            adv_refs = []
            if adv_refs_raw:
                try:
                    if isinstance(adv_refs_raw, str):
                        adv_refs = json.loads(adv_refs_raw)
                    else:
                        adv_refs = adv_refs_raw
                except:
                    adv_refs = []
            
            # If we have multiple advance references, create one entry per reference
            if adv_refs and isinstance(adv_refs, list):
                for idx, ref in enumerate(adv_refs):
                    # Filter strictly by 'appliedNow' or 'selected' flag
                    # Frontend sometimes sends appliedNow as a numeric amount, so handle truthy/numeric > 0
                    applied_now = ref.get('appliedNow')
                    selected = ref.get('selected')
                    
                    is_selected = False
                    if selected is True or applied_now is True:
                        is_selected = True
                    elif applied_now:
                        try:
                            if float(applied_now) > 0:
                                is_selected = True
                        except (ValueError, TypeError):
                            pass
                    
                    allocated_amt = ref.get('amount') or ref.get('allocated_amount') or 0
                    
                    if is_selected and float(allocated_amt) > 0:
                        ref_no = ref.get('refNo') or ref.get('reference_no') or 'Advance'
                        
                        # Convention: {RefNo}-ADJ{InvoiceID}I{Index}
                        display_ref = f"{ref_no}-ADJ{sales_header.id}I{idx}"
                        
                        CustomerTransaction.objects.update_or_create(
                            tenant_id=tenant_id,
                            customer_id=customer.id,
                            transaction_number=display_ref,
                            transaction_type='RECEIPT',
                            defaults={
                                'transaction_date': sales_header.date,
                                'amount': Decimal(str(allocated_amt)),
                                'total_amount': Decimal(str(allocated_amt)),
                                'payment_status': 'Advance Applied',
                                'reference_number': sales_header.sales_invoice_no,
                                'notes': f"Advance adjusted from Ref: {ref_no}"
                            }
                        )
            else:
                # Fallback to single entry if no detailed refs but total amount exists
                CustomerTransaction.objects.update_or_create(
                    tenant_id=tenant_id,
                    customer_id=customer.id,
                    transaction_number=f"ADJ-{sales_header.sales_invoice_no}",
                    transaction_type='RECEIPT',
                    defaults={
                        'transaction_date': sales_header.date,
                        'amount': payment_details.payment_advance,
                        'total_amount': payment_details.payment_advance,
                        'payment_status': 'Advance Applied',
                        'reference_number': sales_header.sales_invoice_no,
                        'notes': "Advance adjusted"
                    }
                )

        logger.info(f"!!! Portal Mirror Sales OK: {sales_header.sales_invoice_no}")
        
        # Immediately refresh status based on linked transactions in portal
        _update_portal_sales_status(tenant_id, customer.id, sales_header.sales_invoice_no)

    except Exception as e:
        logger.error(f"Portal Mirror Sync Error (Sales): {e}")

def mirror_transaction_to_portal(txn):
    """
    Mirror a transaction record (Payment or Receipt) to the Portal.
    txn: Transaction model instance
    """
    try:
        # Determine if Payment or Receipt
        t_type = (txn.transaction_type or '').upper()
        if t_type not in ['PAYMENT', 'RECEIPT']:
            return

        tenant_id = txn.tenant_id
        
        # Get items (allocations)
        items = txn.get_items()
        
        for it in items:
            # Resolve Party
            p_l_id = getattr(it, 'pay_to_ledger_id', None) or getattr(it, 'ledger_id_val', None)
            if t_type == 'PAYMENT':
                vendor = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id, ledger_id=p_l_id).first()
                if vendor:
                    _mirror_payment_item(txn, it, vendor)
            elif t_type == 'RECEIPT':
                customer = CustomerMasterCustomer.objects.filter(tenant_id=tenant_id, ledger_id=p_l_id).first()
                if not customer and hasattr(it, 'customer_name'):
                     customer = CustomerMasterCustomer.objects.filter(tenant_id=tenant_id, customer_name=it.customer_name).first()
                
                if customer:
                    _mirror_receipt_item(txn, it, customer)
                    
    except Exception as e:
        logger.error(f"Portal Mirror Sync Error (Transaction {txn.id}): {e}")

def _mirror_payment_item(voucher, item, vendor):
    # Status
    is_adv = (getattr(item, 'reference_type', '').upper() == 'ADVANCE' or item.is_advance)
    status = 'Advance' if is_adv else 'Received'
    
    # Reference
    ref = item.reference_number or item.advance_ref_no or voucher.voucher_number
    
    VendorTransaction.objects.update_or_create(
        tenant_id=voucher.tenant_id,
        vendor_id=vendor.id,
        transaction_number=f"{voucher.voucher_number}-{item.id}",
        transaction_type='payment',
        defaults={
            'transaction_date': voucher.date,
            'amount': item.allocated_amount or item.amount,
            'total_amount': item.allocated_amount or item.amount,
            'status': status,
            'reference_number': ref,
            'reference_type': getattr(item, 'reference_type', 'invoice'),
            'is_advance': is_adv,
            'notes': f"Payment for {ref}" if ref and ref != 'ADVANCE' else (voucher.narration or "Payment"),
            'ledger_name': vendor.vendor_name or "Vendor"
        }
    )
    
    # If it's a legitimate payment for an invoice, update the invoice's status in portal too
    if status == 'Received' and ref and ref != 'ADVANCE':
        _update_portal_purchase_status(voucher.tenant_id, vendor.id, ref)

def _mirror_receipt_item(voucher, item, customer):
    is_adv = (getattr(item, 'reference_type', '').upper() == 'ADVANCE' or item.is_advance)
    status = 'Advance' if is_adv else 'Partially Utilized'
    
    ref = item.reference_number or item.advance_ref_no or voucher.voucher_number
    
    CustomerTransaction.objects.update_or_create(
        tenant_id=voucher.tenant_id,
        customer_id=customer.id,
        transaction_number=f"{voucher.voucher_number}-{item.id}",
        transaction_type='receipt',
        defaults={
            'transaction_date': voucher.date,
            'amount': item.allocated_amount or item.amount or item.received_amount,
            'total_amount': item.allocated_amount or item.amount or item.received_amount,
            'payment_status': status,
            'reference_number': ref,
            'reference_type': getattr(item, 'reference_type', 'invoice'),
            'is_advance': is_adv,
            'notes': voucher.narration or f"Receipt for {ref}",
            'ledger_name': 'Receipt'
        }
    )

    # Refresh status of the linked invoice in customer portal
    if status != 'Advance' and ref and ref != '-':
        _update_portal_sales_status(voucher.tenant_id, customer.id, ref)

def _update_portal_sales_status(tenant_id, customer_id, ref_no):
    """Refreshes a mirrored sales invoice's status based on total receipts found in portal"""
    try:
        invoice = CustomerTransaction.objects.filter(
            tenant_id=tenant_id, 
            customer_id=customer_id, 
            transaction_type='invoice', 
            reference_number=ref_no
        ).first()
        
        if invoice:
            total_amt = Decimal(str(invoice.total_amount or 0))
            if total_amt <= 0: return

            # Sum all receipts and credit notes
            received = CustomerTransaction.objects.filter(
                tenant_id=tenant_id,
                customer_id=customer_id,
                transaction_type__in=['receipt', 'credit_note'],
                reference_number=ref_no
            ).aggregate(s=models.Sum('total_amount'))['s'] or 0

            # Subtract debit notes
            debits = CustomerTransaction.objects.filter(
                tenant_id=tenant_id,
                customer_id=customer_id,
                transaction_type__in=['debit_note'],
                reference_number=ref_no
            ).aggregate(s=models.Sum('total_amount'))['s'] or 0

            net_received = Decimal(str(received)) - Decimal(str(debits))

            # --- Credit Period Enrichment ---
            is_due = True
            try:
                terms = CustomerMasterCustomerTermsCondition.objects.filter(customer_basic_detail_id=customer_id).first()
                if terms and terms.credit_period:
                    match = re.search(r'(\d+)', str(terms.credit_period))
                    if match:
                        credit_days = int(match.group(1))
                        invoice_date = invoice.transaction_date
                        if invoice_date and (date.today() <= invoice_date + timedelta(days=credit_days)):
                            is_due = False
            except Exception as te:
                logger.warning(f"Failed to fetch credit terms for customer {customer_id}: {te}")

            if net_received >= total_amt:
                invoice.payment_status = 'Received'
            elif net_received > 0:
                # User preference: Show 'Not Due' even if saved with advance if within credit period
                invoice.payment_status = 'Not Due' if not is_due else 'Partially Received'
            else:
                invoice.payment_status = 'Due' if is_due else 'Not Due'
            
            invoice.save(update_fields=['payment_status'])
            print(f"!!! Portal Invoice {ref_no} Status Updated to {invoice.payment_status} (Net Recv: {net_received})")
    except Exception as e:
        logger.error(f"Failed to update portal sales status: {e}")

def _update_portal_purchase_status(tenant_id, vendor_id, ref_no):
    """Refreshes a mirrored purchase's status based on total payments found in portal"""
    try:
        purchase = VendorTransaction.objects.filter(
            tenant_id=tenant_id, 
            vendor_id=vendor_id, 
            transaction_type='purchase', 
            reference_number=ref_no
        ).first()
        
        if purchase:
            total_amt = Decimal(str(purchase.total_amount or 0))
            if total_amt <= 0: return

            # Sum all payments
            paid = VendorTransaction.objects.filter(
                tenant_id=tenant_id,
                vendor_id=vendor_id,
                transaction_type='payment',
                reference_number=ref_no
            ).aggregate(s=models.Sum('total_amount'))['s'] or 0

            if Decimal(str(paid)) >= total_amt:
                purchase.status = 'Received'
            elif Decimal(str(paid)) > 0:
                purchase.status = 'Partially Received'
            else:
                purchase.status = 'Unpaid'
            purchase.save(update_fields=['status'])
    except Exception as e:
        logger.error(f"Failed to update portal purchase status: {e}")

def sync_portal_allocation_to_main_ledger(portal_instance):
    """
    Sync an allocation (reference_number update) from the Portal back to the main Ledger.
    portal_instance: VendorTransaction or CustomerTransaction instance
    """
    try:
        from accounting.models import AdvanceAllocation, PendingTransaction
        
        tx_num = portal_instance.transaction_number
        if '-' not in tx_num:
            return

        # Split into VoucherNo and Item ID
        parts = tx_num.split('-')
        item_id = parts[-1]
        voucher_no = '-'.join(parts[:-1])

        if not item_id.isdigit():
            return

        ref_no = portal_instance.reference_number
        # If reference is generic, skip
        if not ref_no or ref_no.upper() in ['ADVANCE', 'N/A', '-']:
            return

        # NEW: Find the actual Invoice ID to link by reference_id
        from ..models_voucher_sales import VoucherSalesInvoiceDetails
        invoice_obj = VoucherSalesInvoiceDetails.objects.filter(
            tenant_id=portal_instance.tenant_id, 
            sales_invoice_no=ref_no
        ).first()
        ref_id = str(invoice_obj.id) if invoice_obj else ref_no

        # Try to find corresponding record in main system
        # We check both AdvanceAllocation and PendingTransaction
        updated = False
        
        # 1. Check AdvanceAllocation
        adv = AdvanceAllocation.objects.filter(id=item_id, transaction__voucher_number=voucher_no).first()
        if adv:
            adv.reference_number = ref_no
            adv.reference_id = ref_id
            adv.reference_type = 'INVOICE'
            adv.save(update_fields=['reference_number', 'reference_id', 'reference_type'])
            updated = True
            
        # 2. Check PendingTransaction
        pt = PendingTransaction.objects.filter(id=item_id, transaction__voucher_number=voucher_no).first()
        if pt:
            pt.reference_number = ref_no
            pt.reference_id = ref_id
            pt.reference_type = 'INVOICE'
            pt.save(update_fields=['reference_number', 'reference_id', 'reference_type'])
            updated = True
        
        if updated:
            if invoice_obj:
                from .sales_status_service import update_sales_invoice_payment_status
                update_sales_invoice_payment_status(portal_instance.tenant_id, invoice_obj.id)
            logger.info(f"Successfully synced portal allocation {tx_num} -> {ref_no} to main ledger.")
        else:
            logger.warning(f"Could not find backend record for portal allocation {tx_num}")

    except Exception as e:
        logger.error(f"Failed to sync portal allocation to main ledger: {e}")

def delete_purchase_from_portal(purchase_header):
    try:
        VendorTransaction.objects.filter(
            tenant_id=purchase_header.tenant_id,
            transaction_number=purchase_header.purchase_voucher_no or purchase_header.supplier_invoice_no,
            transaction_type='purchase'
        ).delete()
    except Exception as e:
        logger.error(f"Failed to delete purchase mirror: {e}")

def delete_sales_from_portal(sales_header):
    try:
        CustomerTransaction.objects.filter(
            tenant_id=sales_header.tenant_id,
            transaction_number=sales_header.sales_invoice_no,
            transaction_type='invoice'
        ).delete()
    except Exception as e:
        logger.error(f"Failed to delete sales mirror: {e}")

def delete_transaction_from_portal(txn):
    try:
        # Match by prefix of transaction_number since portal uses {voucher}-{id}
        VendorTransaction.objects.filter(
            tenant_id=txn.tenant_id,
            transaction_number__startswith=f"{txn.voucher_number}-"
        ).delete()
        CustomerTransaction.objects.filter(
            tenant_id=txn.tenant_id,
            transaction_number__startswith=f"{txn.voucher_number}-"
        ).delete()
    except Exception as e:
        logger.error(f"Failed to delete transaction mirror: {e}")

