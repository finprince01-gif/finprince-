"""
models_advance_allocation.py
==============================
AdvanceAllocation — unified advance table for Payment and Receipt vouchers.

Replaces:
  - AdvanceAllocationMap (old advance_allocations)
  - VoucherAllocation     (voucher_allocations)
  - parts of PaymentVoucher / ReceiptVoucher headers

One row = one advance payment (single or bulk, payment or receipt).
Use the `type` field to identify the voucher kind and mode.

type choices:
  'payment_single'  — Single payment advance
  'payment_bulk'    — Bulk payment advance
  'receipt_single'  — Single receipt advance
  'receipt_bulk'    — Bulk receipt advance
"""

from django.db import models
from core.models import BaseModel


TYPE_CHOICES = [
    ('payment_single', 'Payment – Single'),
    ('payment_bulk',   'Payment – Bulk'),
    ('receipt_single', 'Receipt – Single'),
    ('receipt_bulk',   'Receipt – Bulk'),
]


class AdvanceAllocation(BaseModel):
    """
    Unified advance allocation for Payment and Receipt vouchers.

    Fields
    ------
    type                Identifies the voucher kind and mode.
    voucher_number      Parent voucher number.
    voucher_date        Date of the parent voucher.
    voucher_type        Config name (e.g. 'Payment-01', 'Receipt-A').
    narration           Free-text note.

    pay_from_ledger_*   Cash/Bank account (Payment=pay from; Receipt=receive in).
    pay_to_ledger_*     Party ledger (Payment=pay to; Receipt=receive from).

    vendor_id/name      Set when party is a vendor.
    customer_id/name    Set when party is a customer.

    advance_ref_no      User-supplied advance reference number.
    advance_amount      The advance amount in this row.
    total_amount        Full voucher total (sum of all items including advance).

    bank_*              Bank reconciliation fields.
    source              'manual' | 'bulk' | 'ai_extracted'
    """

    # ── Type ─────────────────────────────────────────────────────────────────
    type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        db_index=True,
        help_text="payment_single | payment_bulk | receipt_single | receipt_bulk"
    )

    # ── Parent Voucher ────────────────────────────────────────────────────────
    voucher_number = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    voucher_date   = models.DateField(null=True, blank=True)
    voucher_type   = models.CharField(max_length=100, null=True, blank=True)
    narration      = models.TextField(null=True, blank=True)

    # ── Pay From / Receive In  (Cash/Bank Ledger) ─────────────────────────────
    pay_from_ledger = models.ForeignKey(
        'MasterLedger',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='advance_pay_from',
        db_column='pay_from_ledger_id',
    )
    # ── Pay To / Receive From  (Party Ledger) ────────────────────────────────
    pay_to_ledger = models.ForeignKey(
        'MasterLedger',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='advance_pay_to',
        db_column='pay_to_ledger_id',
    )

    # ── Party Identity ────────────────────────────────────────────────────────
    vendor_id   = models.BigIntegerField(null=True, blank=True, db_index=True)
    customer_id = models.BigIntegerField(null=True, blank=True, db_index=True)

    # ── Advance Details ───────────────────────────────────────────────────────
    advance_ref_no = models.CharField(
        max_length=150, null=True, blank=True,
        help_text="User-entered advance reference number"
    )
    advance_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount   = models.DecimalField(max_digits=15, decimal_places=2, default=0,
                                         help_text="Full voucher total")

    # ── Bank Reconciliation ───────────────────────────────────────────────────
    bank_reconciled       = models.BooleanField(default=False)
    bank_reconcile_date   = models.DateField(null=True, blank=True)
    bank_statement_id     = models.BigIntegerField(null=True, blank=True)
    bank_reference_number = models.CharField(max_length=100, null=True, blank=True)

    # ── Source ────────────────────────────────────────────────────────────────
    source = models.CharField(
        max_length=100, default='manual',
        help_text="'manual' | 'bulk' | 'ai_extracted'"
    )

    class Meta:
        db_table = 'advance_allocations'
        verbose_name = 'Advance Allocation'
        verbose_name_plural = 'Advance Allocations'
        indexes = [
            models.Index(fields=['tenant_id', 'type'],           name='adv_alloc_type_idx'),
            models.Index(fields=['tenant_id', 'voucher_number'], name='adv_alloc_vno_idx'),
            models.Index(fields=['tenant_id', 'advance_ref_no'], name='adv_alloc_refno_idx'),
            models.Index(fields=['tenant_id', 'vendor_id'],      name='adv_alloc_vendor_idx'),
            models.Index(fields=['tenant_id', 'customer_id'],    name='adv_alloc_customer_idx'),
            models.Index(fields=['pay_from_ledger'],             name='adv_alloc_pay_from_idx'),
            models.Index(fields=['pay_to_ledger'],               name='adv_alloc_pay_to_idx'),
        ]

    @property
    def amount(self): return self.advance_amount
    @property
    def ledger(self): return self.pay_to_ledger
    @property
    def pay_to(self): return self.pay_to_ledger
    @property
    def customer(self): return self.pay_to_ledger
    @property
    def voucher(self):
        class MockVoucher:
            def __init__(self, adv):
                self.date = adv.voucher_date
                self.voucher_number = adv.voucher_number
        return MockVoucher(self)

    def __str__(self):
        return (
            f"[{self.type}] {self.voucher_number} | "
            f"Advance ₹{self.advance_amount} ({self.advance_ref_no or 'no-ref'})"
        )


# ── Backward-compat alias ─────────────────────────────────────────────────────
AdvanceAllocationMap = AdvanceAllocation   # DEPRECATED — use AdvanceAllocation
