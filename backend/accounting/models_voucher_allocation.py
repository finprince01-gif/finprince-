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
    target_voucher_id = models.BigIntegerField()
    target_type = models.CharField(max_length=20, choices=TARGET_TYPE_CHOICES)
    
    amount = models.DecimalField(max_digits=15, decimal_places=2)

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
