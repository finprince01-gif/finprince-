from django.db import models
from core.models import BaseModel

class VoucherJournal(BaseModel):
    """
    Journal Voucher Model.
    Used for adjustments and non-cash/bank transactions.
    """
    date = models.DateField()
    voucher_number = models.CharField(max_length=100)
    voucher_series = models.CharField(max_length=255, null=True, blank=True)
    
    total_debit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_credit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    narration = models.TextField(null=True, blank=True)
    
    # Reconciliation Fields
    bank_reconciled = models.BooleanField(default=False)
    bank_reconcile_date = models.DateField(null=True, blank=True)
    bank_statement_id = models.BigIntegerField(null=True, blank=True)
    bank_reference_number = models.CharField(max_length=100, null=True, blank=True)
    

    class Meta:

        db_table = 'voucher_journal'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} - {self.total_debit}"


class JournalVoucherEntry(BaseModel):
    """
    Normalized individual ledger entries for a Journal Voucher.
    Replaces the 'entries' JSON array in VoucherJournal.
    """
    voucher = models.ForeignKey(VoucherJournal, on_delete=models.CASCADE, related_name='entry_lines')
    
    ledger_name = models.CharField(max_length=255)
    ledger_id = models.BigIntegerField(null=True, blank=True)
    debit_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    credit_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    entry_note = models.TextField(null=True, blank=True)
    reference_no = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = 'norm_journal_voucher_entries'
