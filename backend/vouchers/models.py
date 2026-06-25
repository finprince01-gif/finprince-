from django.db import models, transaction
from django.utils import timezone
import uuid

def update_job_progress(job_id):
    """
    Atomic progress tracker for Bulk Jobs.
    Calculates completion % and marks job as COMPLETED if all items are done.
    """
    import logging
    logger = logging.getLogger("JobProgress")
    logger.info(f"[BULK_JOB_SYNC_START] job_id={job_id}")
    try:
        # Use aggregation to avoid multiple queries
        stats = InvoiceProcessingItem.objects.filter(job_id=job_id).aggregate(
            total=models.Count('id'),
            completed=models.Count('id', filter=models.Q(status__in=['COMPLETED', 'FINALIZED'])),
            failed=models.Count('id', filter=models.Q(status='FAILED')),
            total_pgs=models.Sum('page_count'),
            proc_pgs=models.Sum('processed_pages')
        )
        
        total = stats['total'] or 0
        completed = stats['completed'] or 0
        failed = stats['failed'] or 0
        total_pgs = stats['total_pgs'] or 0
        proc_pgs = stats['proc_pgs'] or 0
        
        success_rate = (completed / total * 100) if total > 0 else 0
        progress_percentage = int(((completed + failed) / total) * 100) if total > 0 else 0
        new_status = 'PROCESSING'
        
        logger.info(f"[BULK_JOB_PROGRESS] job_id={job_id} completed={completed} failed={failed} total={total} progress={progress_percentage}%")
        
        # Finalization condition (Phase 3D)
        # Requirement #1: terminal_pages = success_pages + failed_pages
        if (completed + failed) >= total and total > 0:
            if failed > 0 and completed > 0:
                new_status = 'PARTIAL'
                logger.info(f"[BULK_JOB_PARTIAL] job_id={job_id} completed={completed} failed={failed} total={total}")
            elif failed > 0 and completed == 0:
                new_status = 'FAILED'
                logger.info(f"[BULK_JOB_COMPLETED] job_id={job_id} status=FAILED total={total}")
            else:
                # [REQUIREMENT] FINALIZED is the authoritative success state
                new_status = 'FINALIZED'
                logger.info(f"[BULK_JOB_FINALIZED] job_id={job_id} status=FINALIZED total={total}")
            
        BulkInvoiceJob.objects.filter(id=job_id).update(
            processed_count=completed,
            failed_count=failed,
            total_pages=total_pgs,
            processed_pages=proc_pgs,
            success_rate=success_rate,
            status=new_status,
            updated_at=models.functions.Now()
        )
    except Exception as e:
        logger.error(f"[BULK_JOB_SYNC_ERROR] job_id={job_id} error={e}")

class BulkInvoiceJob(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('QUEUED', 'Queued'),
        ('PROCESSING', 'Processing'),
        ('FINALIZING', 'Finalizing'),
        ('FINALIZED', 'Finalized'),
        ('COMPLETED', 'Completed'),
        ('PARTIAL', 'Partial Success'),
        ('FAILED', 'Failed'),
    ]
    tenant_id = models.CharField(max_length=100)
    upload_session_id = models.CharField(max_length=255, null=True)
    file_hash = models.CharField(max_length=64, null=True, db_index=True)
    upload_type = models.CharField(max_length=50, default='UNKNOWN')
    total_files = models.IntegerField(default=0)
    processed_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)
    total_pages = models.IntegerField(default=0)
    processed_pages = models.IntegerField(default=0)
    failed_pages = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    last_task_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    last_heartbeat = models.DateTimeField(null=True, blank=True)
    segmentation_done = models.BooleanField(default=False)
    is_cancelled = models.BooleanField(default=False)
    timeout_rate = models.FloatField(default=0.0)
    success_rate = models.FloatField(default=0.0)
    worker_id = models.CharField(max_length=255, null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bulk_invoice_jobs'
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['tenant_id', 'status']),
        ]

class InvoiceProcessingItem(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('QUEUED', 'Queued'),
        ('PROCESSING', 'Processing'),
        ('FINALIZING', 'Finalizing'),
        ('FINALIZED', 'Finalized'),
        ('COMPLETED', 'Completed'),
        ('PARTIAL', 'Partial Success'),
        ('FAILED', 'Failed'),
        ('SKIPPED', 'Skipped (blank)'),
    ]
    job = models.ForeignKey(BulkInvoiceJob, on_delete=models.CASCADE, related_name='items')
    tenant_id = models.CharField(max_length=100, db_index=True)
    file_path = models.CharField(max_length=500)
    file_hash = models.CharField(max_length=64, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    retry_count = models.IntegerField(default=0)
    parent_item_id = models.BigIntegerField(null=True)
    page_number = models.IntegerField(default=1)
    ai_units_consumed = models.IntegerField(default=0) # [PHASE 14 METERING]
    page_count = models.IntegerField(default=1)
    result_json = models.JSONField(null=True)
    error_message = models.TextField(null=True)
    processed_pages = models.IntegerField(default=0)  # Atomic counter for merge
    staging_record_id = models.BigIntegerField(null=True, db_index=True) # Linked InvoiceTempOCR
    last_task_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    worker_id = models.CharField(max_length=255, null=True, blank=True)
    last_heartbeat = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'invoice_processing_items'
        indexes = [
            models.Index(fields=['job', 'status']),
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['status', 'updated_at']),
        ]

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
    upload_type = models.CharField(max_length=50, default='UNKNOWN')
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

    # Added fields for Sprint 3
    normalized_invoice_no = models.CharField(max_length=100, null=True, blank=True)
    vendor_confidence = models.FloatField(null=True, blank=True)
    gstin_confidence = models.FloatField(null=True, blank=True)
    invoice_number_confidence = models.FloatField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)


    class Meta:
        managed = False
        db_table = 'invoice_ocr_temp'
        unique_together = ('tenant_id', 'file_hash', 'upload_session_id')
        verbose_name = 'Invoice OCR Staging Item'

    def __str__(self):
        return f"{self.tenant_id} - {self.file_hash[:8]}"

class ShadowExtractionResult(models.Model):
    """
    Stores the output of the new SQS pipeline during SHADOW mode 
    without overwriting the legacy truth.
    """
    record_id = models.BigIntegerField(db_index=True)
    tenant_id = models.CharField(max_length=100)
    pipeline_type = models.CharField(max_length=50, default='SQS_UNIFIED')
    extracted_data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'shadow_extraction_results'

class ParityReport(models.Model):
    """
    Forensic report comparing Legacy vs New pipeline outputs.
    """
    record_id = models.BigIntegerField(unique=True)
    match_score = models.FloatField() # 1.0 = Perfect Match
    has_mismatch = models.BooleanField(default=False)
    mismatch_details = models.JSONField(null=True)
    legacy_payload = models.JSONField()
    new_payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'parity_reports'
class UploadSession(models.Model):
    """Tracks direct S3 multi-part upload lifecycle (Phase 2 Hardening)."""
    id = models.UUIDField(default=uuid.uuid4, primary_key=True, editable=False)
    tenant_id = models.CharField(max_length=100, db_index=True)
    status = models.CharField(max_length=50, default='INITIATED') 
    file_name = models.CharField(max_length=512)
    s3_key = models.CharField(max_length=1024)
    total_size = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'upload_sessions'

class AIQuota(models.Model):
    """Tracks active AI API calls for concurrency governance (Phase 11).
    Formerly named GeminiQuota. Renamed to be provider-agnostic.
    DB table kept as 'gemini_quotas' for backward compatibility — no migration needed.
    """
    tenant_id = models.CharField(max_length=100, unique=True)
    active_calls = models.IntegerField(default=0)
    max_concurrent = models.IntegerField(default=10)
    tokens = models.FloatField(default=15.0)  # Current available tokens
    bucket_capacity = models.FloatField(default=15.0)
    refill_rate = models.FloatField(default=1.0)  # tokens per second
    last_refill_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Keep existing table name — avoids a destructive migration
        db_table = 'gemini_quotas'


