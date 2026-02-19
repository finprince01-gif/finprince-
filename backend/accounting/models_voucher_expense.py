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
    
    # Store list of expense entries as a JSON object
    # Schema per entry:
    # {
    #   id: string,
    #   expense: string (Ledger Name),
    #   postTo: string (Ledger Name - Bank/Cash/Liability),
    #   billRefNo: string,
    #   entryNote: string,
    #   totalAmount: number,
    #   gstRate: number,
    #   taxableValue: number,
    #   igst: number,
    #   cgst: number,
    #   sgst: number,
    #   cess: number,
    #   showTax: boolean
    # }
    expense_rows = models.JSONField(
        default=list,
        help_text="List of expense entries"
    )
    
    posting_note = models.TextField(null=True, blank=True)
    
    # List of uploaded file names/paths
    uploaded_files = models.JSONField(
        default=list,
        blank=True,
        help_text=" List of uploaded supporting document filenames"
    )

    class Meta:
        managed = False
        db_table = 'voucher_expenses'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.voucher_number} - Expenses"
