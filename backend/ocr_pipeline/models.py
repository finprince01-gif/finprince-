import uuid
from django.db import models

class OCRJob(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
        ('PARTIAL', 'Partial Success'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    total_files = models.IntegerField(default=0)
    processed_files = models.IntegerField(default=0)
    failed_files = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ocr_jobs'
        verbose_name = "OCR Job"
        verbose_name_plural = "OCR Jobs"
        indexes = [
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['created_at']),
        ]

class OCRTask(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(OCRJob, related_name='tasks', on_delete=models.CASCADE)
    file_name = models.CharField(max_length=512)
    file_url = models.URLField(max_length=1024, null=True, blank=True) # S3 URL
    file_hash = models.CharField(max_length=64, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    retry_count = models.IntegerField(default=0)
    error_message = models.TextField(null=True, blank=True)
    result_id = models.BigIntegerField(null=True, blank=True) # ID in invoice_ocr_temp
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ocr_tasks'
        verbose_name = "OCR Task"
        verbose_name_plural = "OCR Tasks"
        indexes = [
            models.Index(fields=['job', 'status']),
            models.Index(fields=['file_hash']),
        ]

class OCRProcessingLock(models.Model):
    """
    EXACTLY-ONCE EXECUTION GATE.
    Atomic DB lock per (file_hash, tenant_id).
    A worker INSERTs this row before calling Gemini.
    If the INSERT conflicts → another worker already claimed it → skip.
    """
    file_hash   = models.CharField(max_length=64)
    tenant_id   = models.CharField(max_length=255)
    task_id     = models.UUIDField()
    result_id   = models.BigIntegerField(null=True, blank=True)
    claimed_at  = models.DateTimeField(auto_now_add=True)
    completed   = models.BooleanField(default=False)

    class Meta:
        db_table = 'ocr_processing_locks'
        unique_together = [('file_hash', 'tenant_id')]
        indexes = [
            models.Index(fields=['file_hash', 'tenant_id']),
        ]

class InvoiceTempOCR(models.Model):
    """
    Unified staging table for OCR extraction results.
    Matches the existing 'invoice_ocr_temp' schema.
    """
    id = models.BigAutoField(primary_key=True)
    file_hash = models.CharField(max_length=64)
    tenant_id = models.CharField(max_length=255)
    file_path = models.CharField(max_length=512)
    upload_session_id = models.CharField(max_length=255, null=True, blank=True)
    voucher_type = models.CharField(max_length=50, null=True, blank=True)
    
    ocr_raw_text = models.TextField(null=True, blank=True)
    extracted_data = models.JSONField(null=True, blank=True) # Source of truth for UI modal
    
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, default='PROCESSING')
    processed = models.BooleanField(default=False)
    
    validation_status = models.CharField(max_length=50, default='PENDING')
    vendor_status = models.CharField(max_length=50, default='PENDING')
    matched_by = models.CharField(max_length=100, null=True, blank=True)
    conflict_message = models.TextField(null=True, blank=True)
    
    vendor_id = models.BigIntegerField(null=True, blank=True)
    voucher_id = models.BigIntegerField(null=True, blank=True)
    
    # Mirror fields
    supplier_invoice_no = models.CharField(max_length=100, null=True, blank=True)
    gstin = models.CharField(max_length=50, null=True, blank=True)
    branch = models.CharField(max_length=255, null=True, blank=True)
    validation_message = models.TextField(null=True, blank=True)
    
    # Extra fields from schema
    group_id = models.CharField(max_length=64, null=True, blank=True)
    financial_year = models.CharField(max_length=20, null=True, blank=True)
    selected_by = models.CharField(max_length=50, default='FALLBACK')
    duplicate_count = models.IntegerField(default=0)
    version_rank = models.IntegerField(default=99)
    is_primary = models.BooleanField(default=False)

    class Meta:
        managed = False # Tables are created by external migrations or preexisting
        db_table = 'invoice_ocr_temp'
