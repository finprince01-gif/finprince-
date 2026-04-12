from django.db import models
from core.models import BaseModel

# ============================================================================
# NORMALIZED RECEIPT VOUCHER MODELS
# ============================================================================

class ReceiptVoucher(BaseModel):
    """
    Unified Receipt Voucher (Master Table).
    Supports multiple entries (customers) in a single voucher.
    """
    date = models.DateField()
    voucher_number = models.CharField(max_length=100)
    voucher_type = models.CharField(max_length=100, null=True, blank=True)
    
    # Receive In (Bank/Cash Account) - Shared for all items
    receive_in = models.ForeignKey(
        'MasterLedger', 
        on_delete=models.CASCADE, 
        related_name='receipts_received_in',
        db_column='receive_in_ledger_id'
    )
    
    # Main Customer reference (Convenience for indexing/display)
    customer = models.ForeignKey(
        'MasterLedger', 
        on_delete=models.CASCADE, 
        related_name='receipts_received_from',
        db_column='customer_ledger_id',
        null=True, 
        blank=True
    )
    
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    notes = models.TextField(null=True, blank=True)
    source = models.CharField(max_length=100, default='manual')

    # Reconciliation Fields
    bank_reconciled = models.BooleanField(default=False)
    bank_reconcile_date = models.DateField(null=True, blank=True)
    bank_statement_id = models.BigIntegerField(null=True, blank=True)
    bank_reference_number = models.CharField(max_length=100, null=True, blank=True)
    
    # Party IDs for explicit tracking
    ledger_id_val     = models.BigIntegerField(null=True, blank=True) # Matches receive_in_ledger_id
    party_customer_id = models.BigIntegerField(null=True, blank=True)
    party_vendor_id   = models.BigIntegerField(null=True, blank=True)

    class Meta:
        db_table = 'receipt_vouchers'
        unique_together = ('tenant_id', 'voucher_number')
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} ({self.date})"

class ReceiptVoucherItem(BaseModel):
    """
    Allocations or individual customer receipts (Child Table).
    In Bulk mode, each item can belong to a different customer.
    """
    voucher = models.ForeignKey(
        ReceiptVoucher, 
        on_delete=models.CASCADE, 
        related_name='items',
        db_column='voucher_id'
    )
    
    customer = models.ForeignKey(
        'MasterLedger',
        on_delete=models.CASCADE,
        related_name='receipt_items',
        db_column='customer_ledger_id'
    )
    
    reference_id = models.CharField(max_length=100, null=True, blank=True) # Invoice No
    reference_type = models.CharField(max_length=50, default='invoice') # invoice, advance, on_account
    pending_transaction = models.JSONField(null=True, blank=True) # JSON object for rich linking
    
    # Financial Details
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0) # Total amount of the reference invoice
    pending_before = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    received_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    balance_after = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    invoice_date = models.DateField(null=True, blank=True)
    
    # Party IDs for explicit tracking
    ledger_id_val     = models.BigIntegerField(null=True, blank=True) # Matches customer_ledger_id
    party_customer_id = models.BigIntegerField(null=True, blank=True)
    party_vendor_id   = models.BigIntegerField(null=True, blank=True)
    
    is_advance = models.BooleanField(default=False)
    advance_ref_no = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = 'receipt_voucher_items'
        constraints = [
            models.UniqueConstraint(
                fields=['tenant_id', 'advance_ref_no'],
                name='unique_receipt_advance_ref',
                condition=models.Q(advance_ref_no__isnull=False) & ~models.Q(advance_ref_no='')
            )
        ]


class ReceiptAllocationDetail(BaseModel):
    """
    Normalized transaction details for ReceiptVoucherItem.
    Tracks which specific sales invoices this receipt is covering.
    Matches schema in migration 0014.
    """
    receipt_item = models.ForeignKey(ReceiptVoucherItem, on_delete=models.CASCADE, related_name='allocations')
    invoice_no = models.CharField(max_length=100, null=True, blank=True)
    invoice_date = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    pending_before = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    received_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    balance_after = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    is_advance = models.BooleanField(default=False)
    advance_ref_no = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:
        db_table = 'norm_receipt_allocations'

# --- DEPRECATED MODELS (Maintained for Migration reference only) ---
class VoucherReceiptSingle(BaseModel):
    class Meta:
        db_table = 'voucher_receipt_single'
        managed = False # Don't sync to DB anymore
class VoucherReceiptBulk(BaseModel):
    class Meta:
        db_table = 'voucher_receipt_bulk'
        managed = False
