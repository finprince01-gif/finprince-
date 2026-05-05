"""
BankStatementTemp — STAGING TABLE ONLY
=======================================
⚠️  THIS IS NOT A VOUCHER TABLE.
⚠️  This data can be deleted at any time.
⚠️  No accounting logic lives here.
⚠️  Only staging + UI state.

Flow:
  Upload file → Gemini extraction → Save here → User maps ledger
  → Post to PaymentVoucherSerializer / ReceiptVoucherSerializer
  → Mark status = posted
"""

from django.db import models


class BankStatementStagingFile(models.Model):
    """
    Parallel staging layer for uploaded bank statement files.
    Stores the full extracted transaction data as JSON.
    """
    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('processed', 'Processed'),
        ('deleted',   'Deleted'),
    ]

    tenant_id        = models.CharField(max_length=255, db_index=True)
    file_name        = models.CharField(max_length=255)
    account_id       = models.BigIntegerField(null=True, blank=True, help_text="Associated bank ledger ID")
    uploaded_at      = models.DateTimeField(auto_now_add=True)
    transaction_data = models.JSONField(help_text="Full extracted JSON from Gemini")
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    expires_at       = models.DateTimeField(help_text="Timestamp for auto-cleanup")
    file_hash        = models.CharField(max_length=64, null=True, blank=True, help_text="Optional hash for deduplication")
    session_id       = models.CharField(max_length=64, null=True, blank=True, help_text="Links to the active processing session")

    class Meta:
        db_table = 'bank_statement_temp'
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.file_name} ({self.status}) - {self.uploaded_at}"


class BankStatementTemp(models.Model):
    """
    Temporary staging table for bank statement rows extracted via Gemini.
    One row per transaction line in the uploaded bank statement.

    STAGING ONLY — never used for final accounting.
    """

    STATUS_CHOICES = [
        ('draft',      'Draft'),       # Extracted, awaiting ledger mapping
        ('mapped',     'Mapped'),      # Ledger assigned, ready to post
        ('posted',     'Posted'),      # Successfully posted to voucher system
        ('failed',     'Failed'),      # Posting failed (see error_message)
        ('duplicate',  'Duplicate'),   # Detected as duplicate of an already-posted transaction
    ]

    INFERRED_TYPE_CHOICES = [
        ('payment', 'Payment'),     # Debit row → money went out
        ('receipt', 'Receipt'),     # Credit row → money came in
    ]

    # ── Identity ──────────────────────────────────────────────────────────────
    tenant_id   = models.CharField(max_length=255, db_index=True)
    session_id  = models.CharField(max_length=64,  db_index=True,
                                   help_text="UUID grouping all rows from one upload")
    voucher_number = models.CharField(max_length=64, blank=True, null=True,
                                      help_text="Internal Voucher number")
    ref_no = models.CharField(max_length=150, null=True, blank=True,
                              help_text="Bank reference number / Cheque number")


    # ── Extracted transaction data ────────────────────────────────────────────
    date        = models.DateField(null=True, blank=True)
    narration   = models.TextField(blank=True, default='')
    posting_note = models.TextField(blank=True, default='')
    debit       = models.DecimalField(max_digits=25, decimal_places=2,
                                      null=True, blank=True)
    credit      = models.DecimalField(max_digits=25, decimal_places=2,
                                      null=True, blank=True)
    balance     = models.DecimalField(max_digits=25, decimal_places=2,
                                      null=True, blank=True,
                                      help_text="Closing balance after this transaction")
    # Convenience field: debit if debit, else credit (set on save, for UI)
    amount      = models.DecimalField(max_digits=25, decimal_places=2,
                                      null=True, blank=True)

    # ── Inferred / user-overrideable type ─────────────────────────────────────
    inferred_type = models.CharField(
        max_length=10,
        choices=INFERRED_TYPE_CHOICES,
        default='payment'
    )

    # ── Ledger mapping (nullable until user maps) ──────────────────────────────
    ledger_id   = models.BigIntegerField(null=True, blank=True,
                                         help_text="ID from accounting.MasterLedger")
    ledger_name = models.CharField(max_length=255, blank=True, default='',
                                   help_text="Denormalized name for quick display")
    category    = models.CharField(max_length=20, blank=True, null=True,
                                   help_text="vendor | customer | ledger")
    party_id    = models.BigIntegerField(null=True, blank=True,
                                         help_text="Portal ID (Vendor ID or Customer ID)")

    # ── Bank account ledger (the 'pay from' / 'receive in' side) ──────────────
    bank_ledger_id   = models.BigIntegerField(null=True, blank=True)
    bank_ledger_name = models.CharField(max_length=255, blank=True, default='')

    # ── Workflow state ─────────────────────────────────────────────────────────
    status        = models.CharField(max_length=12, choices=STATUS_CHOICES, default='draft')
    error_message = models.TextField(null=True, blank=True)
    voucher_id    = models.BigIntegerField(null=True, blank=True,
                                           help_text="ID of created voucher after posting")

    # ── Raw Gemini output for traceability ────────────────────────────────────
    raw_data    = models.JSONField(null=True, blank=True,
                                   help_text="Original Gemini row dict, unmodified")
    raw_text    = models.TextField(null=True, blank=True,
                                   help_text="Raw OCR text line(s) for this transaction")
    allocation_data = models.JSONField(null=True, blank=True,
                                       help_text="Manual allocation: {pendingTransactions: [], advanceAmount: X, ...}")

    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table    = 'bank_statement_temp_rows'
        ordering    = ['date', 'id']
        verbose_name = 'Bank Statement Staging Row'
        verbose_name_plural = 'Bank Statement Staging Rows'

    def __str__(self):
        return f"[{self.status}] {self.date} | {self.narration[:40]} | {self.amount}"

    def save(self, *args, **kwargs):
        # Auto-derive amount from debit / credit
        if self.debit and float(self.debit) > 0:
            self.amount = self.debit
            self.inferred_type = 'payment'
        elif self.credit and float(self.credit) > 0:
            self.amount = self.credit
            self.inferred_type = 'receipt'
        super().save(*args, **kwargs)

