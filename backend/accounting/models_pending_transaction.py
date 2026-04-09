"""
models_pending_transaction.py
==============================
Pending Transaction & Allocation Link models for Bill Allocation Lifecycle.

PendingTransaction
------------------
Stores one row per voucher reference (Purchase Invoice, Debit Note, Payment)
with a running `pending_balance` and `status`.

AllocationLink
--------------
Records every time one reference is applied against another
(e.g., Debit Note applied against Purchase Invoice,
 Payment applied against Purchase Invoice,
 Reversal of a payment).
"""

from django.db import models
from core.models import BaseModel


class PendingTransaction(BaseModel):
    """
    One row per voucher reference in the Bill Allocation ledger.

    Typical lifecycle for a Debit Note
    -----------------------------------
    1. Debit Note created  → Row inserted (status=Open, pending_balance=gross_amount_due)
    2. DN applied vs Inv   → pending_balance decreases (status → Utilized when 0)
    3. If Inv's balance <0 → Payment rows are released (LIFO)

    Typical lifecycle for a Purchase Invoice
    -----------------------------------------
    1. Purchase Voucher saved → Row inserted (status=Unpaid, pending_balance=total)
    2. Payment applied       → pending_balance decreases
    3. Debit Note applied    → pending_balance decreases further
    4. Fully settled         → status=Paid
    """

    REFERENCE_TYPES = [
        ("PURCHASE",   "Purchase Invoice"),
        ("DEBIT_NOTE", "Debit Note"),
        ("PAYMENT",    "Payment Voucher"),
        ("RECEIPT",    "Receipt Voucher"),
        ("REVERSAL",   "Reversal Entry"),
    ]

    STATUS_CHOICES = [
        # Purchase Invoice statuses
        ("Unpaid",         "Unpaid"),
        ("Partially Paid", "Partially Paid"),
        ("Paid",           "Paid"),
        # Debit Note statuses
        ("Open",           "Open"),
        ("Utilized",       "Utilized"),
        # Payment statuses
        ("Unutilized",       "Unutilized"),
        ("Partially Utilized", "Partially Utilized"),
        ("Fully Utilized",    "Fully Utilized"),
    ]

    reference_number = models.CharField(max_length=150, db_index=True)
    reference_type   = models.CharField(max_length=20, choices=REFERENCE_TYPES)
    reference_date   = models.DateField(null=True, blank=True)

    # Party
    vendor_id   = models.IntegerField(null=True, blank=True, db_index=True)
    customer_id = models.IntegerField(null=True, blank=True, db_index=True)

    # Back-reference to source document
    purchase_voucher_id = models.BigIntegerField(null=True, blank=True)

    # Amounts
    original_amount  = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    pending_balance  = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="Open")

    class Meta:
        db_table = "pending_transactions"
        unique_together = ("tenant_id", "reference_number", "reference_type")
        indexes = [
            models.Index(fields=["tenant_id", "vendor_id"]),
            models.Index(fields=["tenant_id", "customer_id"]),
            models.Index(fields=["tenant_id", "reference_type", "status"]),
        ]

    def __str__(self):
        return f"{self.reference_type}:{self.reference_number} – balance={self.pending_balance}"


class AllocationLink(BaseModel):
    """
    Records every allocation event between two voucher references.

    Examples
    --------
    - Payment PAY-001 applied against Purchase INV/001 → amount=100000
    - Debit Note DN-001 applied against Purchase INV/001 → amount=30000
    - Reversal of PAY-001 due to DN-001 → amount=-30000
    """

    REFERENCE_TYPES = [
        ("PURCHASE",   "Purchase Invoice"),
        ("DEBIT_NOTE", "Debit Note"),
        ("PAYMENT",    "Payment Voucher"),
        ("RECEIPT",    "Receipt Voucher"),
        ("REVERSAL",   "Reversal Entry"),
    ]

    # Source (what is being applied)
    source_reference_number = models.CharField(max_length=150)
    source_reference_type   = models.CharField(max_length=20, choices=REFERENCE_TYPES)
    source_reference_date   = models.DateField(null=True, blank=True)

    # Target (what it is applied against)
    target_reference_number = models.CharField(max_length=150)
    target_reference_type   = models.CharField(max_length=20, choices=REFERENCE_TYPES)

    # Amount can be negative for reversals
    amount_applied = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        db_table = "allocation_links"
        indexes = [
            models.Index(fields=["tenant_id", "source_reference_number", "source_reference_type"]),
            models.Index(fields=["tenant_id", "target_reference_number", "target_reference_type"]),
        ]

    def __str__(self):
        return (
            f"{self.source_reference_type}:{self.source_reference_number} "
            f"→ {self.target_reference_type}:{self.target_reference_number} "
            f"₹{self.amount_applied}"
        )
