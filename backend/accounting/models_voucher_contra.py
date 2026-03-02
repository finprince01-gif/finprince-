from django.db import models
from core.models import BaseModel

class VoucherContra(BaseModel):
    """
    Contra Voucher Model.
    Used for Cash/Bank to Cash/Bank transfers.
    """
    date = models.DateField()
    voucher_number = models.CharField(max_length=100)
    
    # In pure accounting terms:
    # Cash deposited into Bank: Debit Bank, Credit Cash
    # Cash withdrawn from Bank: Debit Cash, Credit Bank
    # Fund Transfer: Debit Receiver Bank, Credit Giver Bank
    
    # Frontend sends: fromAccount (Source/Credit), toAccount (Destination/Debit)
    from_account = models.CharField(max_length=255, help_text="Source Ledger (Credit)")
    to_account = models.CharField(max_length=255, help_text="Destination Ledger (Debit)")
    
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    narration = models.TextField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'voucher_contra'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} - {self.amount}"
