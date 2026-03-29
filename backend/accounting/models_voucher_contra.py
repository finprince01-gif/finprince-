from django.db import models
from core.models import BaseModel

class VoucherContra(BaseModel):
    """
    Contra Voucher Model.
    Used for Cash/Bank to Cash/Bank transfers.
    """
    date = models.DateField()
    voucher_number = models.CharField(max_length=100)
    voucher_series = models.CharField(max_length=100, null=True, blank=True)
    
    # In pure accounting terms:
    # Cash deposited into Bank: Debit Bank, Credit Cash
    # Cash withdrawn from Bank: Debit Cash, Credit Bank
    # Fund Transfer: Debit Receiver Bank, Credit Giver Bank
    
    # Frontend sends: fromAccount (Source/Credit), toAccount (Destination/Debit)
    from_account = models.CharField(max_length=255, help_text="Source Ledger (Credit)")
    to_account = models.CharField(max_length=255, help_text="Destination Ledger (Debit)")
    
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    narration = models.TextField(null=True, blank=True)

    # Reconciliation Fields
    bank_reconciled = models.BooleanField(default=False)
    bank_reconcile_date = models.DateField(null=True, blank=True)
    bank_statement_id = models.BigIntegerField(null=True, blank=True)
    bank_reference_number = models.CharField(max_length=100, null=True, blank=True)

    # Forex Details
    conversion_rate = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    payment_amt_foreign = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    payment_rate = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    payment_amt_inr = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    receipt_amt_foreign = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    receipt_rate = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    receipt_amt_inr = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    forex_gain_loss = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)

    # Charges and Regulatory
    deduct_charges_from = models.CharField(max_length=255, null=True, blank=True)
    conversion_charges = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    fema_purpose_code = models.CharField(max_length=100, null=True, blank=True)

    # Link to unified Voucher model (if needed)
    voucher_id = models.BigIntegerField(null=True, blank=True)

    class Meta:

        db_table = 'voucher_contra'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} - {self.amount}"
