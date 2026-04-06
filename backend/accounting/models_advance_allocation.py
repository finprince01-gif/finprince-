from django.db import models
from core.models import BaseModel


class AdvanceAllocationMap(BaseModel):
    """
    Tracks the consumption of advance payments against specific invoices.

    advance_source_id  → PK of PaymentVoucherItem (payment) or ReceiptVoucherItem (receipt).
                         This is the CANONICAL key — advance_ref_no is secondary.
    advance_source_type→ 'payment' | 'receipt'
    advance_ref_no     → Human-readable reference number (display only, not a unique key).
    voucher_id         → ID from the global `vouchers` table of the invoice that consumed
                         this advance.
    voucher_type       → 'sales' | 'purchase'
    ledger_id          → MasterLedger ID of the party (customer/vendor) for fast filtering.
    amount             → How much of the advance was consumed by this voucher.

    Remaining balance is ALWAYS computed dynamically:
        remaining = total_advance_amount - SUM(amount) WHERE advance_source_id = X
    """

    ADVANCE_SOURCE_CHOICES = [
        ('payment', 'Payment Voucher Item'),
        ('receipt', 'Receipt Voucher Item'),
    ]

    VOUCHER_TYPE_CHOICES = [
        ('sales', 'Sales Invoice'),
        ('purchase', 'Purchase Invoice'),
    ]

    # ── Source (the advance itself) ──────────────────────────────────
    advance_source_id = models.BigIntegerField(
        help_text="PK of PaymentVoucherItem or ReceiptVoucherItem"
    )
    advance_source_type = models.CharField(
        max_length=20,
        choices=ADVANCE_SOURCE_CHOICES,
        default='payment',
        help_text="'payment' or 'receipt'"
    )
    advance_ref_no = models.CharField(
        max_length=150,
        null=True,
        blank=True,
        help_text="Human-readable reference number (display only)"
    )

    # ── Target (the invoice consuming this advance) ──────────────────
    voucher_id = models.BigIntegerField(
        help_text="ID from the global vouchers table"
    )
    voucher_type = models.CharField(
        max_length=20,
        choices=VOUCHER_TYPE_CHOICES,
        help_text="'sales' or 'purchase'"
    )
    ledger_id = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="MasterLedger ID of the party (for filtering)"
    )

    # ── Amount consumed ──────────────────────────────────────────────
    amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Amount of the advance consumed by this voucher"
    )

    class Meta:
        db_table = 'advance_allocations'
        verbose_name = 'Advance Allocation'
        verbose_name_plural = 'Advance Allocations'
        indexes = [
            # Primary lookup: remaining balance per advance source
            models.Index(
                fields=['tenant_id', 'advance_source_id', 'advance_source_type'],
                name='adv_alloc_source_idx'
            ),
            # Lookup by ref_no (display, not unique key)
            models.Index(
                fields=['tenant_id', 'advance_ref_no'],
                name='adv_alloc_refno_idx'
            ),
            # Idempotent delete on voucher resave
            models.Index(
                fields=['tenant_id', 'voucher_id', 'voucher_type'],
                name='adv_alloc_voucher_idx'
            ),
            # Party-level filtering (portal views)
            models.Index(
                fields=['tenant_id', 'ledger_id'],
                name='adv_alloc_ledger_idx'
            ),
        ]

    def __str__(self):
        return (
            f"Alloc #{self.id}: ₹{self.amount} from "
            f"{self.advance_source_type}:{self.advance_source_id} "
            f"→ {self.voucher_type}:{self.voucher_id}"
        )
