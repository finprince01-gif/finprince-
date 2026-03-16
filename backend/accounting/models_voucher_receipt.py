from django.db import models
from core.models import BaseModel

# ============================================================================
# RECEIPT VOUCHER MODELS
# ============================================================================

class VoucherReceiptSingle(BaseModel):
    """
    Stores single receipt voucher details.
    """
    date = models.DateField()
    voucher_type = models.CharField(max_length=100, null=True, blank=True)
    voucher_number = models.CharField(max_length=100)
    
    # Receive In (Bank/Cash Account)
    receive_in = models.ForeignKey('MasterLedger', on_delete=models.CASCADE, null=True, blank=True, related_name='receipt_single_in', db_column='receive_in_ledger_id')
    receive_from = models.ForeignKey('MasterLedger', on_delete=models.CASCADE, null=True, blank=True, related_name='receipt_single_from', db_column='receive_from_ledger_id')
    
    total_receipt = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    source = models.CharField(max_length=100, default='manual')

    # Advance Receipt details
    advance_ref_no = models.CharField(max_length=100, null=True, blank=True)
    advance_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Stores the grid of transactions being received against
    transaction_details = models.JSONField(
        null=True, 
        blank=True,
        help_text="List of transactions: [{date, referenceNumber, amount, receipt, pending, advance}]"
    )

    # Reconciliation Fields
    bank_reconciled = models.BooleanField(default=False)
    bank_reconcile_date = models.DateField(null=True, blank=True)
    bank_statement_id = models.BigIntegerField(null=True, blank=True)
    bank_reference_number = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'voucher_receipt_single'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} - {self.receive_from}"

class VoucherReceiptBulk(BaseModel):
    """
    Stores bulk receipt voucher details.
    """
    date = models.DateField()
    voucher_number = models.CharField(max_length=100)
    
    # Receive In (Bank/Cash Account)
    receive_in = models.ForeignKey('MasterLedger', on_delete=models.CASCADE, null=True, blank=True, related_name='receipt_bulk_in', db_column='receive_in_ledger_id')
    
    # List of {receiveFrom, amount}
    receipt_rows = models.JSONField(
        null=True, 
        blank=True,
        help_text="List of customers and amounts to receive"
    )
    
    posting_note = models.TextField(null=True, blank=True)
    
    # Advance Receipt details
    advance_ref_no = models.CharField(max_length=100, null=True, blank=True)
    advance_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Transactions received against (if specific invoices selected)
    transaction_details = models.JSONField(
        null=True, 
        blank=True,
        help_text="List of transactions: [{date, invoiceNo, amount, receiveNow, pending, advance}]"
    )

    # Reconciliation Fields
    bank_reconciled = models.BooleanField(default=False)
    bank_reconcile_date = models.DateField(null=True, blank=True)
    bank_statement_id = models.BigIntegerField(null=True, blank=True)
    bank_reference_number = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'voucher_receipt_bulk'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} - Bulk"
