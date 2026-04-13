"""
models_pending_transaction.py
==============================
PendingTransaction — unified invoice-level allocation table for
Payment and Receipt vouchers.

Replaces:
  - PaymentVoucherItem          (payment_voucher_items)
  - ReceiptVoucherItem          (receipt_voucher_items)
  - VoucherPendingTransaction   (voucher_pending_transactions)
  - AllocationLink              (allocation_links)

One row = one invoice-level allocation line inside a Payment or Receipt voucher.
Use the `type` field to identify the voucher kind and mode.

type choices:
  'payment_single'  — Single payment invoice allocation
  'payment_bulk'    — Bulk payment invoice allocation
  'receipt_single'  — Single receipt invoice allocation
  'receipt_bulk'    — Bulk receipt invoice allocation
"""

from django.db import models
from core.models import BaseModel


TYPE_CHOICES = [
    ('payment_single', 'Payment – Single'),
    ('payment_bulk',   'Payment – Bulk'),
    ('receipt_single', 'Receipt – Single'),
    ('receipt_bulk',   'Receipt – Bulk'),
]

REFERENCE_TYPE_CHOICES = [
    ('invoice',     'Invoice'),
    ('advance',     'Advance'),
    ('on_account',  'On Account'),
    ('debit_note',  'Debit Note'),
    ('credit_note', 'Credit Note'),
]

STATUS_CHOICES = [
    ('pending',            'Pending'),
    ('partially_paid',     'Partially Paid'),
    ('paid',               'Paid'),
    ('partially_received', 'Partially Received'),
    ('received',           'Received'),
    ('cancelled',          'Cancelled'),
]


class PendingTransaction(BaseModel):
    """
    Unified pending (invoice-level) transaction for Payment and Receipt vouchers.

    Covers:
      - Invoice payments in Single Payment  (type='payment_single')
      - Invoice payments in Bulk   Payment  (type='payment_bulk')
      - Invoice receipts in Single Receipt  (type='receipt_single')
      - Invoice receipts in Bulk   Receipt  (type='receipt_bulk')

    Fields
    ------
    type                    Identifies the voucher kind and mode.
    voucher_number          Parent voucher number.
    voucher_date            Date of the parent voucher.
    voucher_type            Config name (e.g. 'Payment-01').

    pay_from_ledger_*       Cash/Bank account used (Payment=debit, Receipt=credit).
    pay_to_ledger_*         Party ledger (Payment=Pay To, Receipt=Receive From).

    vendor_id/name          Set when party is a vendor.
    customer_id/name        Set when party is a customer.

    reference_number        The invoice/PO/DN number being settled.
    reference_type          'invoice' | 'advance' | 'on_account' | ...
    invoice_date            Date of the referenced invoice.

    original_amount         Total invoice value.
    pending_amount          Amount outstanding before THIS allocation.
    amount_applied          Amount being paid/received in this row.
    balance_after           Remaining balance after this allocation.

    status                  Lifecycle status of the invoice.
    due_date / days_to_due  Payment due details.
    narration               Line-level note.
    """

    # ── Type ─────────────────────────────────────────────────────────────────
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, db_index=True)

    # ── Parent Voucher ────────────────────────────────────────────────────────
    voucher_number = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    voucher_date   = models.DateField(null=True, blank=True)
    voucher_type   = models.CharField(max_length=100, null=True, blank=True)

    # ── Pay From / Receive In  (Cash/Bank Ledger) ─────────────────────────────
    pay_from_ledger = models.ForeignKey(
        'MasterLedger',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='pending_pay_from',
        db_column='pay_from_ledger_id',
    )
    # ── Pay To / Receive From  (Party Ledger) ────────────────────────────────
    pay_to_ledger = models.ForeignKey(
        'MasterLedger',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='pending_pay_to',
        db_column='pay_to_ledger_id',
    )

    # ── Party Identity ────────────────────────────────────────────────────────
    vendor_id   = models.BigIntegerField(null=True, blank=True, db_index=True)
    customer_id = models.BigIntegerField(null=True, blank=True, db_index=True)

    # ── Invoice / Reference ───────────────────────────────────────────────────
    reference_number = models.CharField(
        max_length=150, null=True, blank=True, db_index=True
    )
    reference_type = models.CharField(
        max_length=30,
        choices=REFERENCE_TYPE_CHOICES,
        default='invoice',
    )
    invoice_date = models.DateField(null=True, blank=True)

    # ── Amounts ───────────────────────────────────────────────────────────────
    original_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    pending_amount  = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount_applied  = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    balance_after   = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    # ── Status & Due ──────────────────────────────────────────────────────────
    status      = models.CharField(
        max_length=30, choices=STATUS_CHOICES, default='pending', db_index=True
    )
    due_date    = models.DateField(null=True, blank=True)
    days_to_due = models.IntegerField(null=True, blank=True)

    # ── Misc ──────────────────────────────────────────────────────────────────
    narration = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'pending_transactions'
        indexes = [
            models.Index(fields=['tenant_id', 'type'],            name='pt_tenant_type_idx'),
            models.Index(fields=['tenant_id', 'voucher_number'],  name='pt_voucher_idx'),
            models.Index(fields=['tenant_id', 'voucher_date'],    name='pt_date_idx'),
            models.Index(fields=['tenant_id', 'vendor_id'],       name='pt_vendor_idx'),
            models.Index(fields=['tenant_id', 'customer_id'],     name='pt_customer_idx'),
            models.Index(fields=['tenant_id', 'reference_number'],name='pt_refno_idx'),
            models.Index(fields=['tenant_id', 'status'],          name='pt_status_idx'),
            models.Index(fields=['pay_from_ledger'],              name='pt_payfrom_idx'),
            models.Index(fields=['pay_to_ledger'],                name='pt_payto_idx'),
        ]

    @property
    def amount(self): return self.amount_applied
    @property
    def received_amount(self): return self.amount_applied
    @property
    def ledger(self): return self.pay_to_ledger
    @property
    def pay_to(self): return self.pay_to_ledger
    @property
    def customer(self): return self.pay_to_ledger

    def __str__(self):
        return (
            f"[{self.type}] {self.voucher_number} | "
            f"{self.reference_number} ₹{self.amount_applied}"
        )


# ── Backward-compat aliases ───────────────────────────────────────────────────
AllocationLink            = PendingTransaction   # DEPRECATED
VoucherPendingTransaction = PendingTransaction   # DEPRECATED
