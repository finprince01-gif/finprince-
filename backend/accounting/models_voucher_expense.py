from django.db import models
from core.models import BaseModel

# ============================================================================
# EXPENSE VOUCHER MODEL
# ============================================================================

class VoucherExpense(BaseModel):
    """
    Stores expense voucher details.
    One voucher can have multiple expense rows (entries).
    """
    date = models.DateField()
    voucher_number = models.CharField(max_length=100)
    
    posting_note = models.TextField(null=True, blank=True)
    
    # List of uploaded file names/paths
    uploaded_files = models.JSONField(
        default=list,
        blank=True,
        help_text=" List of uploaded supporting document filenames"
    )

    class Meta:

        db_table = 'voucher_expenses'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} - Expenses"


class ExpenseLineItem(BaseModel):
    """
    Normalized individual expense entries for a VoucherExpense.
    Replaces the 'expense_rows' JSON array.
    """
    expense_voucher = models.ForeignKey(VoucherExpense, on_delete=models.CASCADE, related_name='rel_items')
    
    expense_ledger_name = models.CharField(max_length=255)
    expense_ledger_id = models.BigIntegerField(null=True, blank=True)
    post_to_ledger_name = models.CharField(max_length=255)
    post_to_ledger_id = models.BigIntegerField(null=True, blank=True)
    
    bill_ref_no = models.CharField(max_length=100, null=True, blank=True)
    entry_note = models.TextField(null=True, blank=True)
    
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    taxable_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    cgst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    sgst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    igst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = 'norm_voucher_expense_items'
