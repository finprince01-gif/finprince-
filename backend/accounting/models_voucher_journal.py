from django.db import models
from core.models import BaseModel

class VoucherJournal(BaseModel):
    """
    Journal Voucher Model.
    Used for adjustments and non-cash/bank transactions.
    """
    date = models.DateField()
    voucher_number = models.CharField(max_length=100)
    
    total_debit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_credit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    narration = models.TextField(null=True, blank=True)
    
    # Store entries as JSON: [{ledger: '', debit: 0, credit: 0, note: '', refNo: ''}]
    # This matches the frontend 'entries' state
    entries = models.JSONField(default=list, help_text="List of journal entries")

    class Meta:
        managed = False
        db_table = 'voucher_journal'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} - {self.total_debit}"
