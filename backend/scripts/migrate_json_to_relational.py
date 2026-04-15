import os
import django
import json
import logging
from decimal import Decimal

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from inventory.models import (
    InventoryOperationJobWork, InventoryOperationJobWorkItem,
    InventoryOperationInterUnit, InventoryOperationInterUnitItem,
    InventoryOperationLocationChange, InventoryOperationLocationChangeItem,
    InventoryOperationProduction, InventoryOperationProductionItem,
    InventoryOperationConsumption, InventoryOperationConsumptionItem,
    InventoryOperationScrap, InventoryOperationScrapItem,
    InventoryOperationOutward, InventoryOperationOutwardItem,
    InventoryOperationNewGRN, InventoryOperationNewGRNItem
)
from accounting.models_voucher_purchase import (
    VoucherPurchaseSupplyINRDetails, VoucherPurchaseSupplyForeignDetails,
    VoucherPurchaseItem, VoucherPurchaseDueDetails, VoucherPurchaseAdvanceLink
)
from accounting.models_voucher_payment import PaymentVoucherItem, PaymentAllocationDetail
from accounting.models_voucher_receipt import ReceiptVoucherItem, ReceiptAllocationDetail
from accounting.models_voucher_journal import VoucherJournal, JournalVoucherEntry
from accounting.models_voucher_expense import VoucherExpense, ExpenseLineItem
from accounting.models_voucher_debit_note import VoucherDebitNoteSupplyDetails, VoucherDebitNoteItem
from customerportal.database import (
    CustomerTransactionSalesQuotationGeneral, CustomerTransactionSalesQuotationGeneralItem,
    CustomerTransactionSalesQuotationSpecific, CustomerTransactionSalesQuotationSpecificItem
)

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def to_decimal(val, default=0):
    try:
        if val is None or val == '': return Decimal(str(default))
        return Decimal(str(val))
    except (ValueError, TypeError, OverflowError):
        return Decimal(str(default))

def migrate_inventory():
    logger.info("Migrating Inventory Operation Items...")
    
    mapping = [
        (InventoryOperationJobWork, InventoryOperationJobWorkItem),
        (InventoryOperationInterUnit, InventoryOperationInterUnitItem),
        (InventoryOperationLocationChange, InventoryOperationLocationChangeItem),
        (InventoryOperationProduction, InventoryOperationProductionItem),
        (InventoryOperationConsumption, InventoryOperationConsumptionItem),
        (InventoryOperationScrap, InventoryOperationScrapItem),
        (InventoryOperationOutward, InventoryOperationOutwardItem),
        (InventoryOperationNewGRN, InventoryOperationNewGRNItem),
    ]
    
    for ParentModel, ItemModel in mapping:
        logger.info(f"Processing {ParentModel.__name__}...")
        parents = ParentModel.objects.exclude(items__in=[None, [], '[]'])
        for parent in parents:
            items_data = parent.items
            if isinstance(items_data, str):
                try: items_data = json.loads(items_data)
                except: continue
            
            if not isinstance(items_data, list): continue
            
            for item in items_data:
                ItemModel.objects.get_or_create(
                    parent=parent,
                    item_code=item.get('itemCode', item.get('item_code', '')),
                    item_name=item.get('itemName', item.get('item_name', '')),
                    defaults={
                        'tenant_id': parent.tenant_id,
                        'description': item.get('description', ''),
                        'quantity': to_decimal(item.get('qty', item.get('quantity', 0))),
                        'uom': item.get('uom', ''),
                        'rate': to_decimal(item.get('itemRate', item.get('rate', 0))),
                        'taxable_value': to_decimal(item.get('taxableValue', item.get('taxable_value', 0))),
                        'gst_rate': to_decimal(item.get('gstRate', 0)),
                        'igst': to_decimal(item.get('igst', 0)),
                        'cgst': to_decimal(item.get('cgst', 0)),
                        'sgst': to_decimal(item.get('sgst', 0)),
                        'cess': to_decimal(item.get('cess', 0)),
                        'total_value': to_decimal(item.get('invoiceValue', item.get('totalValue', item.get('total_value', 0)))),
                    }
                )

def migrate_purchase_vouchers():
    logger.info("Migrating Purchase Voucher Items...")
    
    # INR Supplies
    inr_supplies = VoucherPurchaseSupplyINRDetails.objects.exclude(items__in=[None, [], '[]'])
    for supply in inr_supplies:
        items = supply.items
        if isinstance(items, str): items = json.loads(items)
        for item in items:
            VoucherPurchaseItem.objects.get_or_create(
                supplier_details=supply.supplier_details,
                item_code=item.get('itemCode', ''),
                quantity=to_decimal(item.get('qty', 0)),
                defaults={
                    'tenant_id': supply.tenant_id,
                    'item_name': item.get('itemName', ''),
                    'hsn_sac': item.get('hsnSac', ''),
                    'uom': item.get('uom', ''),
                    'rate': to_decimal(item.get('itemRate', 0)),
                    'taxable_value': to_decimal(item.get('taxableValue', 0)),
                    'igst_amount': to_decimal(item.get('igst', 0)),
                    'cgst_amount': to_decimal(item.get('cgst', 0)),
                    'sgst_amount': to_decimal(item.get('sgst', 0)),
                    'cess_amount': to_decimal(item.get('cess', 0)),
                    'invoice_value': to_decimal(item.get('invoiceValue', 0)),
                    'currency': 'INR',
                    'exchange_rate': 1.0
                }
            )

    # Foreign Supplies
    foreign_supplies = VoucherPurchaseSupplyForeignDetails.objects.exclude(items__in=[None, [], '[]'])
    for supply in foreign_supplies:
        items = supply.items
        if isinstance(items, str): items = json.loads(items)
        for item in items:
            VoucherPurchaseItem.objects.get_or_create(
                supplier_details=supply.supplier_details,
                item_code=item.get('itemCode', ''),
                quantity=to_decimal(item.get('qty', 0)),
                defaults={
                    'tenant_id': supply.tenant_id,
                    'item_name': item.get('itemName', ''),
                    'hsn_sac': item.get('hsnSac', ''),
                    'uom': item.get('uom', ''),
                    'rate': to_decimal(item.get('itemRate', 0)),
                    'taxable_value': to_decimal(item.get('taxableValue', 0)),
                    'igst_amount': to_decimal(item.get('igst', 0)),
                    'cgst_amount': to_decimal(item.get('cgst', 0)),
                    'sgst_amount': to_decimal(item.get('sgst', 0)),
                    'cess_amount': to_decimal(item.get('cess', 0)),
                    'invoice_value': to_decimal(item.get('invoiceValue', 0)),
                    'currency': supply.foreign_currency,
                    'exchange_rate': supply.exchange_rate
                }
            )

    # Advance links
    due_records = VoucherPurchaseDueDetails.objects.exclude(advance_references__in=[None, [], '[]'])
    for due in due_records:
        advances = due.advance_references
        if isinstance(advances, str): advances = json.loads(advances)
        for adv in advances:
            VoucherPurchaseAdvanceLink.objects.get_or_create(
                due_details=due,
                ref_no=adv.get('refNo', ''),
                defaults={
                    'tenant_id': due.tenant_id,
                    'date': adv.get('date', '2026-01-01'), # Fallback date
                    'amount': to_decimal(adv.get('amount', 0)),
                    'applied_now': to_decimal(adv.get('appliedNow', 0))
                }
            )

def migrate_payment_allocations():
    logger.info("Migrating Payment Allocations...")
    payments = PaymentVoucherItem.objects.exclude(transaction_details__in=[None, [], '[]'])
    for item in payments:
        details = item.transaction_details
        if isinstance(details, str): details = json.loads(details)
        for d in details:
            if not isinstance(d, dict): continue
            PaymentAllocationDetail.objects.get_or_create(
                payment_item=item,
                invoice_no=d.get('referenceNumber', d.get('invoiceNo', '')),
                defaults={
                    'tenant_id': item.tenant_id,
                    'invoice_date': d.get('date'),
                    'total_amount': to_decimal(d.get('amount', 0)),
                    'paid_amount': to_decimal(d.get('payment', d.get('payNow', 0))),
                    'pending_amount': to_decimal(d.get('pending', 0)),
                    'is_advance': d.get('advance', False)
                }
            )

def migrate_receipt_allocations():
    logger.info("Migrating Receipt Allocations...")
    receipts = ReceiptVoucherItem.objects.exclude(pending_transaction__in=[None, [], '[]'])
    for item in receipts:
        details = item.pending_transaction
        if isinstance(details, str): details = json.loads(details)
        # Handle cases where pending_transaction might be a single object or list
        if isinstance(details, dict): details = [details]
        for d in details:
            if not isinstance(d, dict): continue
            ReceiptAllocationDetail.objects.get_or_create(
                receipt_item=item,
                invoice_no=d.get('invoiceNo', d.get('referenceNumber', '')),
                defaults={
                    'tenant_id': item.tenant_id,
                    'invoice_date': d.get('date'),
                    'amount': to_decimal(d.get('amount', 0)),
                    'pending_before': to_decimal(d.get('pendingBefore', d.get('pending', 0))),
                    'received_amount': to_decimal(d.get('receivedAmount', d.get('payment', 0))),
                    'balance_after': to_decimal(d.get('balanceAfter', 0)),
                    'is_advance': d.get('isAdvance', d.get('advance', False)),
                    'advance_ref_no': d.get('advanceRefNo', '')
                }
            )

def migrate_journal_entries():
    logger.info("Migrating Journal Entries...")
    journals = VoucherJournal.objects.exclude(entries__in=[None, [], '[]'])
    for j in journals:
        entries = j.entries
        if isinstance(entries, str): entries = json.loads(entries)
        for e in entries:
            JournalVoucherEntry.objects.get_or_create(
                voucher=j,
                ledger_name=e.get('ledger', ''),
                debit_amount=to_decimal(e.get('debit', 0)),
                credit_amount=to_decimal(e.get('credit', 0)),
                defaults={
                    'tenant_id': j.tenant_id,
                    'ledger_id': None, # We'll need to look this up if possible
                    'entry_note': e.get('note', ''),
                    'reference_no': e.get('refNo', '')
                }
            )

def migrate_expense_items():
    logger.info("Migrating Expense Items...")
    expenses = VoucherExpense.objects.exclude(expense_rows__in=[None, [], '[]'])
    for v in expenses:
        rows = v.expense_rows
        if isinstance(rows, str): rows = json.loads(rows)
        for r in rows:
            ExpenseLineItem.objects.get_or_create(
                expense_voucher=v,
                expense_ledger_name=r.get('expense', ''),
                bill_ref_no=r.get('billRefNo', ''),
                defaults={
                    'tenant_id': v.tenant_id,
                    'post_to_ledger_name': r.get('postTo', ''),
                    'entry_note': r.get('entryNote', ''),
                    'total_amount': to_decimal(r.get('totalAmount', 0)),
                    'taxable_value': to_decimal(r.get('taxableValue', 0)),
                    'igst': to_decimal(r.get('igst', 0)),
                    'cgst': to_decimal(r.get('cgst', 0)),
                    'sgst': to_decimal(r.get('sgst', 0)),
                    'amount': to_decimal(r.get('amount', 0)),
                }
            )

def migrate_debit_note_items():
    logger.info("Migrating Debit Note Items...")
    debit_notes = VoucherDebitNoteSupplyDetails.objects.exclude(items__in=[None, [], '[]'])
    for supply in debit_notes:
        items = supply.items
        if isinstance(items, str): items = json.loads(items)
        for item in items:
            VoucherDebitNoteItem.objects.get_or_create(
                supply_details=supply,
                item_code=item.get('itemCode', ''),
                quantity=to_decimal(item.get('qty', 0)),
                defaults={
                    'tenant_id': supply.tenant_id,
                    'item_name': item.get('itemName', ''),
                    'hsn_sac': item.get('hsnSac', ''),
                    'uom': item.get('uom', ''),
                    'rate': to_decimal(item.get('itemRate', 0)),
                    'taxable_value': to_decimal(item.get('taxableValue', 0)),
                    'igst_amount': to_decimal(item.get('igst', 0)),
                    'cgst_amount': to_decimal(item.get('cgst', 0)),
                    'sgst_amount': to_decimal(item.get('sgst', 0)),
                    'cess_amount': to_decimal(item.get('cess', 0)),
                    'invoice_value': to_decimal(item.get('invoiceValue', 0)),
                    'reason_for_return': item.get('reasonForReturn', '')
                }
            )

def migrate_customer_quotations():
    logger.info("Migrating Customer Quotations...")
    # General
    general_quotes = CustomerTransactionSalesQuotationGeneral.objects.exclude(items__in=[None, [], '[]'])
    for q in general_quotes:
        items = q.items
        if isinstance(items, str): items = json.loads(items)
        for item in items:
            CustomerTransactionSalesQuotationGeneralItem.objects.get_or_create(
                quotation=q,
                item_code=item.get('itemCode', ''),
                defaults={
                    'tenant_id': q.tenant_id,
                    'item_name': item.get('itemName', ''),
                    'uom': item.get('uom', ''),
                    'effective_rate': to_decimal(item.get('rate', 0))
                }
            )
    
    # Specific
    specific_quotes = CustomerTransactionSalesQuotationSpecific.objects.exclude(items__in=[None, [], '[]'])
    for q in specific_quotes:
        items = q.items
        if isinstance(items, str): items = json.loads(items)
        for item in items:
            CustomerTransactionSalesQuotationSpecificItem.objects.get_or_create(
                quotation=q,
                item_code=item.get('itemCode', ''),
                defaults={
                    'tenant_id': q.tenant_id,
                    'item_name': item.get('itemName', ''),
                    'hsn_sac': item.get('hsnSac', ''),
                    'quantity': to_decimal(item.get('qty', 0)),
                    'uom': item.get('uom', ''),
                    'rate': to_decimal(item.get('itemRate', 0)),
                    'taxable_value': to_decimal(item.get('taxableValue', 0)),
                    'gst_rate': to_decimal(item.get('gstRate', 0)),
                    'gst_amount': to_decimal(item.get('gstAmount', 0)),
                    'total_value': to_decimal(item.get('invoiceValue', 0))
                }
            )

if __name__ == "__main__":
    try:
        migrate_inventory()
        migrate_purchase_vouchers()
        migrate_payment_allocations()
        migrate_receipt_allocations()
        migrate_journal_entries()
        migrate_expense_items()
        migrate_debit_note_items()
        migrate_customer_quotations()
        logger.info("MIGRATION COMPLETED SUCCESSFULLY!")
    except Exception as e:
        logger.exception(f"Migration failed: {e}")
