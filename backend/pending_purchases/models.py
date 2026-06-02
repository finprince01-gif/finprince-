from django.db import models

class PendingPurchase(models.Model):
    id = models.BigAutoField(primary_key=True)
    company_id = models.CharField(max_length=255, db_index=True)
    branch_id = models.CharField(max_length=255, null=True, blank=True)
    scan_session_id = models.CharField(max_length=255, db_index=True)
    source_scan_row_id = models.BigIntegerField(db_index=True)
    source_document_hash = models.CharField(max_length=64)
    invoice_number = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    invoice_date = models.CharField(max_length=50, null=True, blank=True)
    vendor_name = models.CharField(max_length=512, null=True, blank=True)
    vendor_gstin = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    vendor_status = models.CharField(max_length=50, default='PENDING')
    voucher_status = models.CharField(max_length=50, default='PENDING')
    item_status = models.CharField(max_length=50, default='PENDING')
    
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('RESOLVED', 'Resolved'),
        ('REJECTED', 'Rejected')
    ]
    pending_purchase_status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    
    extraction_payload = models.JSONField(null=True, blank=True)
    review_payload = models.JSONField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'pending_purchase_queue'
        constraints = [
            models.UniqueConstraint(fields=['source_scan_row_id'], name='unique_source_scan_row'),
            models.UniqueConstraint(fields=['source_document_hash'], name='unique_source_document_hash')
        ]
