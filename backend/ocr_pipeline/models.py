import uuid
from django.db import models
from django.utils import timezone
from datetime import datetime
from enum import Enum

class PipelineStatus(models.TextChoices):
    QUEUED = 'QUEUED', 'Queued'
    PROCESSING = 'PROCESSING', 'Processing'
    EXTRACTING = 'EXTRACTING', 'Extracting'
    ASSEMBLING = 'ASSEMBLING', 'Assembling'
    FINALIZING = 'FINALIZING', 'Finalizing'
    FINALIZED = 'FINALIZED', 'Finalized'
    FAILED = 'FAILED', 'Failed'


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
    total_pages = models.IntegerField(default=0)
    processed_pages = models.IntegerField(default=0)
    failed_pages = models.IntegerField(default=0)
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

def update_ocr_job_progress(job_id):
    """
    Atomic progress tracker for OCR Jobs (Phase 16).
    """
    try:
        from .models import OCRJob, OCRTask
        stats = OCRTask.objects.filter(job_id=job_id).aggregate(
            total=models.Count('id'),
            completed=models.Count('id', filter=models.Q(status='COMPLETED')),
            failed=models.Count('id', filter=models.Q(status='FAILED'))
        )
        
        total = stats['total'] or 0
        completed = stats['completed'] or 0
        failed = stats['failed'] or 0
        
        new_status = 'PROCESSING'
        if (completed + failed) >= total and total > 0:
            if failed == total:
                new_status = 'FAILED'
            elif failed > 0:
                new_status = 'PARTIAL'
            else:
                new_status = 'COMPLETED'
        
        OCRJob.objects.filter(id=job_id).update(
            processed_files=completed,
            failed_files=failed,
            status=new_status,
            updated_at=timezone.now()
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to update OCR job progress: {e}")

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

class FinalizedSnapshot(models.Model):
    """
    PHASE 4: IMMUTABLE FINAL SNAPSHOT
    Stores frozen, grouped, and normalized results once the pipeline is terminal.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session_id = models.CharField(max_length=255, db_index=True)
    tenant_id = models.CharField(max_length=255, db_index=True)
    job_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    
    snapshot_json = models.JSONField(null=True, blank=True) # Contains all grouped invoices + items
    s3_key = models.CharField(max_length=512, null=True, blank=True)
    invoice_count = models.IntegerField(default=0)
    checksum = models.CharField(max_length=64, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    finalized_at = models.DateTimeField(null=True, blank=True)
    snapshot_version = models.IntegerField(default=1)

    class Meta:
        db_table = 'finalized_snapshots'
        indexes = [
            models.Index(fields=['session_id', 'tenant_id']),
        ]

class SessionFinalizationState(models.Model):
    """
    MANDATORY FIX #1: Authoritative Completion Tracker.
    Stores terminal aggregation state persistently.
    """
    id = models.CharField(max_length=255, primary_key=True) # Usually record_id or session_id
    
    # Deterministic Barrier Tracking
    expected_pages = models.IntegerField(default=0)
    completed_pages = models.IntegerField(default=0)
    failed_pages = models.IntegerField(default=0)
    ai_completed_pages = models.IntegerField(default=0)
    
    # Legacy / Compatibility fields
    total_pages_expected = models.IntegerField(default=0)
    total_pages_completed = models.IntegerField(default=0)
    
    snapshot_created = models.BooleanField(default=False)
    finalized_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'session_finalization_states'

class InvoicePageResult(models.Model):
    """
    MANDATORY DURABILITY FIX: First-class DB persistence for finalized pages.
    Ensures canonical page payloads are never lost even if Redis expires.
    """
    record_id = models.BigIntegerField(db_index=True)
    page_number = models.IntegerField()
    session_id = models.CharField(max_length=255, db_index=True)
    canonical_payload = models.JSONField()
    counted_in_barrier = models.BooleanField(default=False)  # Idempotency guard
    is_failed = models.BooleanField(default=False)           # Page terminal failure flag
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'invoice_page_results'
        unique_together = ('record_id', 'page_number')
        indexes = [
            models.Index(fields=['record_id', 'page_number']),
            models.Index(fields=['session_id']),
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
    status = models.CharField(max_length=50, default='PROCESSING')
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
    irn = models.CharField(max_length=255, null=True, blank=True)
    ack_no = models.CharField(max_length=255, null=True, blank=True)
    ack_date = models.CharField(max_length=255, null=True, blank=True)
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
class ExportTask(models.Model):
    """
    PHASE 5G: ASYNC EXPORT TRACKER.
    Tracks background generation of Zoho/Excel datasets.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session_id = models.CharField(max_length=255, db_index=True)
    tenant_id = models.CharField(max_length=255, db_index=True)
    status = models.CharField(max_length=50, default='PENDING', db_index=True) # PENDING, PROCESSING, COMPLETED, FAILED
    file_url = models.CharField(max_length=512, null=True, blank=True)
    export_type = models.CharField(max_length=50, default='ZOHO')
    
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'export_tasks'
        indexes = [
            models.Index(fields=['session_id', 'tenant_id']),
        ]

class PoisonDocument(models.Model):
    """
    PHASE 11: FORENSIC POISON DOCUMENT STORAGE.
    Captures terminal failures for offline analysis and replay.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    correlation_id = models.CharField(max_length=255, db_index=True, null=True, blank=True)
    session_id = models.CharField(max_length=255, db_index=True, null=True, blank=True)
    record_id = models.BigIntegerField(db_index=True, null=True, blank=True)
    
    worker_role = models.CharField(max_length=50)
    queue_name = models.CharField(max_length=50)
    
    payload = models.JSONField()
    error_trace = models.TextField()
    retry_count = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'poison_documents'
        verbose_name = "Poison Document"
        verbose_name_plural = "Poison Documents"

class PoisonPDF(models.Model):
    """
    PHASE 6C: FORENSIC DLQ (Legacy).
    """
    item_id = models.BigIntegerField(db_index=True)
    job_id = models.CharField(max_length=255, null=True, blank=True)
    tenant_id = models.CharField(max_length=255, db_index=True)
    file_path = models.CharField(max_length=512)
    error_message = models.TextField()
    retry_count = models.IntegerField(default=0)
    task_payload = models.JSONField()
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'poison_pdfs'

class AICache(models.Model):
    """
    PHASE 9: AI INFERENCE CACHE.
    Stores deterministic extraction results for identical OCR text.
    Reduces redundant Gemini calls for repeated vendor layouts.
    """
    key_hash = models.CharField(max_length=64, primary_key=True) # SHA256 of cleaned OCR text
    payload = models.JSONField()
    hits = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_hit_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ai_inference_cache'
        verbose_name = "AI Inference Cache"
        verbose_name_plural = "AI Inference Caches"
