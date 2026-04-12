from django.db import models
from core.models import BaseModel

class VoucherAllocation(BaseModel):
    """
    Generic allocation system for Customer (Receipt vs Sales) 
    and Vendor (Payment vs Purchase) portals.
    """
    SOURCE_TYPE_CHOICES = [
        ('PAYMENT', 'Payment'),
        ('RECEIPT', 'Receipt'),
    ]
    TARGET_TYPE_CHOICES = [
        ('SALES', 'Sales Invoice'),
        ('PURCHASE', 'Purchase Invoice'),
    ]

    ledger = models.ForeignKey(
        'MasterLedger', 
        on_delete=models.CASCADE, 
        related_name='voucher_allocations',
        db_column='ledger_id'
    )
    
    # The source of the money (Receipt/Payment)
    source_voucher_id = models.BigIntegerField()
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPE_CHOICES)
    
    # The target being paid (Sales/Purchase Invoice)
    target_voucher_id = models.BigIntegerField(null=True, blank=True)
    target_type = models.CharField(max_length=20, choices=TARGET_TYPE_CHOICES)
    
    # Normalized fields for precise 'Voucher Applied' tracking
    # Target Info (The Invoice being paid)
    target_voucher_no = models.CharField(max_length=100, null=True, blank=True)
    target_voucher_date = models.DateField(null=True, blank=True)
    
    # Source Info (The Receipt/Payment/CN/JV being applied)
    source_voucher_no   = models.CharField(max_length=100, null=True, blank=True)
    source_voucher_date = models.DateField(null=True, blank=True)
    
    # Financials
    pending_amount   = models.DecimalField(max_digits=15, decimal_places=2, default=0) # Before this payment
    amount           = models.DecimalField(max_digits=15, decimal_places=2) # Amount applied
    balance_after    = models.DecimalField(max_digits=15, decimal_places=2, default=0) # After this payment
    
    # Party IDs for explicit tracking
    party_customer_id = models.BigIntegerField(null=True, blank=True)
    party_vendor_id   = models.BigIntegerField(null=True, blank=True)
    
    # Legacy/Meta
    reference_type   = models.CharField(max_length=50, default='INVOICE') # INVOICE, ADVANCE, etc.

    class Meta:
        db_table = 'voucher_allocations'
        verbose_name = "Voucher Allocation"
        indexes = [
            models.Index(fields=['tenant_id', 'ledger']),
            models.Index(fields=['source_voucher_id', 'source_type']),
            models.Index(fields=['target_voucher_id', 'target_type']),
        ]

    def __str__(self):
        return f"Allocation: {self.amount} from {self.source_type}:{self.source_voucher_id} to {self.target_type}:{self.target_voucher_id}"
