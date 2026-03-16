from django.db import models  # type: ignore[import]
from core.models import BaseModel  # type: ignore[import]


class BankStatementTransaction(BaseModel):
    """
    Staging table for bank statement transactions.
    Transactions are parsed from uploaded bank statement files and stored here
    BEFORE any voucher creation.  Vouchers are only created when the user
    explicitly selects "Create Voucher" in the Bank Reconciliation UI.
    """
    bank_ledger = models.ForeignKey(
        'accounting.MasterLedger',
        on_delete=models.CASCADE,
        related_name='statement_transactions'
    )
    transaction_date = models.DateField()
    description = models.TextField(null=True, blank=True, db_column='narration')

    debit_amount = models.DecimalField(
        max_digits=15, decimal_places=2, default=0,
        db_column='debit'
    )
    credit_amount = models.DecimalField(
        max_digits=15, decimal_places=2, default=0,
        db_column='credit'
    )
    reference_number = models.CharField(max_length=100, null=True, blank=True)
    cheque_number = models.CharField(max_length=100, null=True, blank=True)
    running_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    import_batch_id = models.CharField(max_length=100, null=True, blank=True)

    STATUS_CHOICES = [
        ('UNMATCHED', 'Unmatched'),
        ('AUTO_MATCHED', 'Auto Matched'),
        ('MANUAL_MATCHED', 'Manual Matched'),
        ('IGNORED', 'Ignored'),
        ('DUPLICATE', 'Duplicate'),
    ]
    status = models.CharField(
        max_length=50,
        default='UNMATCHED',
        choices=STATUS_CHOICES,
        db_column='match_status'
    )
    
    matched_voucher_id = models.BigIntegerField(null=True, blank=True)
    confidence_score = models.IntegerField(default=0)
    match_method = models.CharField(max_length=50, null=True, blank=True)
    # Store IDs of multiple vouchers for potential matches
    multi_voucher_ids = models.JSONField(null=True, blank=True)

    # Suggested fields for intelligent matching
    suggested_party = models.CharField(max_length=255, null=True, blank=True)
    suggested_invoice = models.CharField(max_length=100, null=True, blank=True)
    suggested_voucher_type = models.CharField(max_length=20, null=True, blank=True)

    source = models.CharField(max_length=50, default='BANK_UPLOAD')
    is_ignored = models.BooleanField(default=False)
    reconciled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'bank_statement_transactions'
        indexes = [
            models.Index(fields=['tenant_id', 'bank_ledger', 'status']),
            models.Index(fields=['tenant_id', 'transaction_date']),
            models.Index(fields=['reference_number']),
            models.Index(fields=['cheque_number']),
            models.Index(fields=['matched_voucher_id']),
        ]
        unique_together = (
            'bank_ledger',
            'transaction_date',
            'reference_number',
            'debit_amount',
            'credit_amount',
        )

    def __str__(self):
        return (
            f"{self.transaction_date} | Dr:{self.debit_amount} "
            f"Cr:{self.credit_amount} | {self.status}"
        )


class BankReconciliationLink(BaseModel):
    """
    Stores the mapping between a bank statement transaction and a voucher.
    This is the reconciliation record — separate from voucher tables.

    Extended schema for traceability:
      - voucher_type: type of voucher (payment, receipt, sales, purchase)
      - confidence_score: score at time of matching
      - match_method: how the match was achieved (voucher_match, reference_match, etc.)
      - reconciled_at: timestamp when auto-reconciled
    """
    bank_transaction = models.ForeignKey(
        BankStatementTransaction,
        on_delete=models.CASCADE,
        related_name='reconciliation_links',
        unique=True
    )
    voucher_id = models.BigIntegerField(unique=True)
    voucher_type = models.CharField(
        max_length=50, 
        null=True, blank=True,
        choices=[('payment', 'Payment'), ('receipt', 'Receipt')]
    )
    reconciliation_date = models.DateField(null=True, blank=True)
    reconciliation_status = models.CharField(max_length=20, default='Reconciled')
    reconciliation_type = models.CharField(
        max_length=50,
        default='manual',
        choices=[('automatic', 'Automatic'), ('manual', 'Manual')]
    )
    confidence_score = models.IntegerField(default=0)
    match_method = models.CharField(
        max_length=50,
        null=True, blank=True,
        choices=[
            ('voucher_match', 'Voucher Match'),
            ('reference_match', 'Reference Match'),
            ('invoice_match', 'Invoice Match'),
            ('party_match', 'Party Match'),
            ('heuristic_match', 'Heuristic Match'),
            ('create_voucher', 'Create Voucher'),
        ]
    )
    cheque_number = models.CharField(max_length=100, null=True, blank=True)
    reconciled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'bank_reconciliation_links'
        # unique_together redundant now due to individual unique fields, but keeping for clarity if needed
        # or replacing with a single record guard.


    def __str__(self):
        return f"Txn#{self.bank_transaction_id} → Voucher#{self.voucher_id} [{self.match_method}]"
