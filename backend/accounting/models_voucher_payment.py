from django.db import models
from core.models import BaseModel

# ============================================================================
# PAYMENT VOUCHER MODELS
# ============================================================================

class VoucherPaymentSingle(BaseModel):
    """
    Stores single payment voucher details.
    """
    date = models.DateField()
    voucher_type = models.CharField(max_length=100, null=True, blank=True)
    voucher_number = models.CharField(max_length=100)
    pay_from = models.ForeignKey('MasterLedger', on_delete=models.CASCADE, null=True, blank=True, related_name='payment_single_from', db_column='pay_from_ledger_id')
    pay_to = models.ForeignKey('MasterLedger', on_delete=models.CASCADE, null=True, blank=True, related_name='payment_single_to', db_column='pay_to_ledger_id')
    total_payment = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    source = models.CharField(max_length=100, default='manual')

    # Advance Payment details
    advance_ref_no = models.CharField(max_length=100, null=True, blank=True)
    advance_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Stores the grid of transactions being paid
    transaction_details = models.JSONField(
        null=True, 
        blank=True,
        help_text="List of transactions: [{date, referenceNumber, amount, payment, pending, advance}]"
    )

    # Reconciliation Fields
    bank_reconciled = models.BooleanField(default=False)
    bank_reconcile_date = models.DateField(null=True, blank=True)
    bank_statement_id = models.BigIntegerField(null=True, blank=True)
    bank_reference_number = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'voucher_payment_single'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} - {self.pay_to}"

class VoucherPaymentBulk(BaseModel):
    """
    Stores bulk payment voucher details.
    """
    date = models.DateField()
    voucher_number = models.CharField(max_length=100)
    pay_from = models.ForeignKey('MasterLedger', on_delete=models.CASCADE, null=True, blank=True, related_name='payment_bulk_from', db_column='pay_from_ledger_id')
    
    # List of {payTo, amount}
    payment_rows = models.JSONField(
        null=True, 
        blank=True,
        help_text="List of vendors and amounts to pay"
    )
    
    posting_note = models.TextField(null=True, blank=True)
    
    # Advance Payment details
    advance_ref_no = models.CharField(max_length=100, null=True, blank=True)
    advance_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Transactions paid against (if specific invoices selected)
    transaction_details = models.JSONField(
        null=True, 
        blank=True,
        help_text="List of transactions: [{date, invoiceNo, amount, payNow, pending, advance}]"
    )

    # Reconciliation Fields
    bank_reconciled = models.BooleanField(default=False)
    bank_reconcile_date = models.DateField(null=True, blank=True)
    bank_statement_id = models.BigIntegerField(null=True, blank=True)
    bank_reference_number = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'voucher_payment_bulk'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} - Bulk"
