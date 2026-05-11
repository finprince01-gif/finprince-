from django.db import models

class BulkInvoiceJob(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('QUEUED', 'Queued'),
        ('PROCESSING', 'Processing'),
        ('FINALIZING', 'Finalizing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    ]
    tenant_id = models.CharField(max_length=100)
    upload_session_id = models.CharField(max_length=255, null=True)
    file_hash = models.CharField(max_length=64, null=True)
    total_files = models.IntegerField(default=0)
    processed_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    segmentation_done = models.BooleanField(default=False)
    is_cancelled = models.BooleanField(default=False)
    timeout_rate = models.FloatField(default=0.0)
    success_rate = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:

        db_table = 'bulk_invoice_jobs'

class InvoiceProcessingItem(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('QUEUED', 'Queued'),
        ('PROCESSING', 'Processing'),
        ('FINALIZING', 'Finalizing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
        ('SKIPPED', 'Skipped (blank)'),
    ]
    job = models.ForeignKey(BulkInvoiceJob, on_delete=models.CASCADE, related_name='items')
    tenant_id = models.CharField(max_length=100, db_index=True)
    file_path = models.CharField(max_length=500)
    file_hash = models.CharField(max_length=64, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    retry_count = models.IntegerField(default=0)
    parent_item_id = models.BigIntegerField(null=True)
    page_number = models.IntegerField(default=1)
    page_count = models.IntegerField(default=1)
    result_json = models.JSONField(null=True)
    error_message = models.TextField(null=True)
    processed_pages = models.IntegerField(default=0)  # Atomic counter for merge
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'invoice_processing_items'

class InvoiceOCRTemp(models.Model):
    """
    Staging table for OCR results before they are finalized into ERP vouchers.
    Enforces uniqueness on file_hash + tenant_id.
    """
    file_hash = models.CharField(max_length=64)
    tenant_id = models.CharField(max_length=255)
    file_path = models.TextField()
    upload_session_id = models.CharField(max_length=255, null=True, blank=True)
    voucher_type = models.CharField(max_length=50, default='PURCHASE')
    expires_at = models.DateTimeField(null=True, blank=True)
    ocr_raw_text = models.TextField(null=True, blank=True)
    extracted_data = models.JSONField(null=True, blank=True)
    processed = models.BooleanField(default=False)
    validation_status = models.CharField(max_length=50, default='PENDING')
    vendor_status = models.CharField(max_length=50, default='PENDING')
    matched_by = models.CharField(max_length=100, null=True, blank=True)
    conflict_message = models.TextField(null=True, blank=True)
    vendor_id = models.BigIntegerField(null=True, blank=True)
    voucher_id = models.BigIntegerField(null=True, blank=True)
    status = models.CharField(max_length=50, default='PROCESSING')
    
    # Persistent Identity & Grouping (Added for stable deduplication)
    group_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    financial_year = models.CharField(max_length=20, null=True, blank=True)
    selected_by = models.CharField(max_length=50, default='FALLBACK')
    duplicate_count = models.IntegerField(default=0)
    version_rank = models.IntegerField(default=99)
    is_primary = models.BooleanField(default=False)
    
    # Identity Validation Fields (Step 5: Store normalized fields)
    supplier_invoice_no = models.CharField(max_length=100, null=True, blank=True)
    gstin = models.CharField(max_length=50, null=True, blank=True)
    branch = models.CharField(max_length=255, null=True, blank=True)
    validation_message = models.TextField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'invoice_ocr_temp'
        unique_together = ('tenant_id', 'file_hash', 'upload_session_id')
        verbose_name = 'Invoice OCR Staging Item'

    def __str__(self):
        return f"{self.tenant_id} - {self.file_hash[:8]}"
