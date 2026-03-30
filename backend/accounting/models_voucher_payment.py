from django.db import models
from core.models import BaseModel

# ============================================================================
# PAYMENT VOUCHER MODELS  (consolidated — replaces VoucherPaymentSingle +
#                          VoucherPaymentBulk as of 2026-03-28)
#
# Single payment  = 1 row in PaymentVoucherItem
# Bulk  payment   = N rows in PaymentVoucherItem  (one per Pay-To ledger)
# ============================================================================

class PaymentVoucher(BaseModel):
    """
    Unified payment voucher master record.

    Replaces:
      - VoucherPaymentSingle  (db: voucher_payment_single)
      - VoucherPaymentBulk    (db: voucher_payment_bulk)

    The single/bulk distinction is a UI-only concept and is now inferred from
    the number of related PaymentVoucherItem rows (1 = single, N = bulk).
    """
    date           = models.DateField()
    voucher_number = models.CharField(max_length=100)
    pay_from       = models.ForeignKey(
                        'MasterLedger',
                        on_delete=models.RESTRICT,
                        null=True, blank=True,
                        related_name='payment_vouchers_from',
                        db_column='pay_from_id')
    voucher_type   = models.CharField(max_length=100, null=True, blank=True)
    source         = models.CharField(max_length=100, default='manual')
    narration      = models.TextField(null=True, blank=True)   # was notes in Bulk
    total_amount   = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    # Bank Reconciliation fields
    bank_reconciled        = models.BooleanField(default=False)
    bank_reconcile_date    = models.DateField(null=True, blank=True)
    bank_statement_id      = models.BigIntegerField(null=True, blank=True)
    bank_reference_number  = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = 'payment_vouchers'
        unique_together = ('tenant_id', 'voucher_number')
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'date']),
            models.Index(fields=['voucher_number']),
        ]

    def __str__(self):
        return f"{self.voucher_number} ({self.date})"

    @property
    def is_bulk(self):
        """True when this voucher has more than one line item."""
        return self.items.count() > 1


class PaymentVoucherItem(models.Model):
    """
    One line item per Pay-To ledger inside a PaymentVoucher.

    Single payment → 1 PaymentVoucherItem.
    Bulk   payment → N PaymentVoucherItems (one per vendor).
    """
    voucher = models.ForeignKey(
                  PaymentVoucher,
                  on_delete=models.CASCADE,
                  related_name='items')
    pay_to_ledger = models.ForeignKey(
                  'MasterLedger',
                  on_delete=models.RESTRICT,
                  related_name='payment_items_to',
                  db_column='pay_to_ledger_id')
    amount  = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    # NEW: Unified linking for normal payments vs advances
    # 'INVOICE' → matched to reference_id
    # 'ADVANCE' → reference_id is NULL
    tenant_id = models.CharField(max_length=36, db_index=True, null=True, blank=True)
    reference_type = models.CharField(max_length=20, default='INVOICE')
    reference_id   = models.BigIntegerField(null=True, blank=True)
    advance_ref_no = models.CharField(max_length=100, null=True, blank=True)

    # Invoice-level transaction breakdown (denormalized JSON blob).
    # Single  schema: [{date, referenceNumber, amount, payment, pending, advance}]
    # Bulk    schema: [{date, invoiceNo,       amount, payNow,  pending, advance}]
    transaction_details = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True,     null=True, blank=True)

    class Meta:
        db_table = 'payment_voucher_items'
        constraints = [
            models.UniqueConstraint(
                fields=['tenant_id', 'advance_ref_no'],
                name='unique_payment_advance_ref',
                condition=models.Q(advance_ref_no__isnull=False) & ~models.Q(advance_ref_no='')
            )
        ]
        indexes = [
            models.Index(fields=['voucher']),
            models.Index(fields=['pay_to_ledger']),
        ]

    def __str__(self):
        return f"Item {self.id} → {self.pay_to_ledger} = {self.amount}"


# ---------------------------------------------------------------------------
# Backward-compatibility aliases
# ---------------------------------------------------------------------------
VoucherPaymentSingle = PaymentVoucher   # DEPRECATED
VoucherPaymentBulk   = PaymentVoucher   # DEPRECATED
