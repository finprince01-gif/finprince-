import uuid
from django.db import models
from django.utils import timezone
from datetime import datetime
from enum import Enum
import uuid

class PipelineStatus(models.TextChoices):
    QUEUED = 'QUEUED', 'Queued'
    PROCESSING = 'PROCESSING', 'Processing'
    EXTRACTING = 'EXTRACTING', 'Extracting'
    ASSEMBLING = 'ASSEMBLING', 'Assembling'
    FINALIZING = 'FINALIZING', 'Finalizing'
    FINALIZED = 'FINALIZED', 'Finalized'
    FAILED = 'FAILED', 'Failed'

class WorkflowSequence(models.Model):
    """
    PHASE 7: EVENT SEQUENCE CONTENTION FIX
    Dedicated table for sequence generation to prevent InnoDB gap-lock deadlocks
    caused by MAX(event_sequence) + 1 over the main PipelineEvent table.
    """
    workflow_id = models.CharField(max_length=255, primary_key=True)
    current_sequence = models.BigIntegerField(default=0)
    current_version = models.BigIntegerField(default=0)
    last_event_id = models.BigIntegerField(null=True, blank=True)

    class Meta:
        db_table = 'workflow_sequences'

class PipelineEvent(models.Model):
    """
    PHASE 10: DB Hardening (Append-only Event Table).
    Immutable state transitions to prevent row-lock contention on InvoiceTempOCR.
    """
    id = models.BigAutoField(primary_key=True)
    record_id = models.CharField(max_length=255, db_index=True)
    session_id = models.CharField(max_length=255, db_index=True, null=True, blank=True)
    status = models.CharField(max_length=50)
    worker_node = models.CharField(max_length=255, null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)
    
    # ── [PHASE 2 & 3: EVENT VERSIONING & CAUSAL ORDERING] ──
    workflow_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    workflow_version = models.BigIntegerField(default=1)
    event_sequence = models.BigIntegerField(default=1)
    causation_id = models.CharField(max_length=255, null=True, blank=True)
    correlation_id = models.CharField(max_length=255, null=True, blank=True)
    parent_event_id = models.BigIntegerField(null=True, blank=True)
    
    # ── [PHASE 3 & 6: SCHEMA VERSIONING & EVENT INTEGRITY] ──
    event_schema_version = models.IntegerField(default=1)
    event_checksum = models.CharField(max_length=64, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pipeline_events'
        unique_together = (('workflow_id', 'event_sequence'),)
        indexes = [
            models.Index(fields=['record_id', 'created_at']),
            models.Index(fields=['session_id', 'status']),
            models.Index(fields=['workflow_id', 'workflow_version']),
        ]

    def is_valid(self):
        """Phase 6: Verifies the cryptographic integrity of the event."""
        import hashlib
        import json
        payload = f"{self.workflow_id}:{self.event_sequence}:{self.status}:{self.workflow_version}:{json.dumps(self.metadata or {}, sort_keys=True)}"
        expected = hashlib.sha256(payload.encode('utf-8')).hexdigest()
        return self.event_checksum == expected

    def save(self, *args, **kwargs):
        """Phase 6: Enforce Strict Immutability and Checksum Generation."""
        if self.pk is not None:
            raise ValueError("[EVENT_INTEGRITY] PipelineEvent is strictly append-only. Mutations are forbidden.")
        
        if not self.event_checksum:
            import hashlib
            import json
            payload = f"{self.workflow_id}:{self.event_sequence}:{self.status}:{self.workflow_version}:{json.dumps(self.metadata or {}, sort_keys=True)}"
            self.event_checksum = hashlib.sha256(payload.encode('utf-8')).hexdigest()
            
        super().save(*args, **kwargs)

def log_pipeline_event(record_id: str, status: str, session_id: str = None, metadata: dict = None, 
                       workflow_id: str = None, causation_id: str = None, correlation_id: str = None,
                       tenant_id: str = None, job_id: str = None):
    try:
        from django.db import transaction, IntegrityError
        from core.middleware import get_correlation_id
        
        actual_workflow_id = workflow_id or session_id or str(record_id)
        actual_correlation_id = correlation_id or get_correlation_id()
        
        # ── [PHASE 7: EVENT SEQUENCE CONTENTION FIX] ──
        # Use dedicated sequence table to avoid InnoDB gap-lock deadlocks!
        max_retries = 3
        event = None
        for attempt in range(max_retries):
            try:
                # 1. Deadlock-Safe Check-and-Get Sequence (Avoids get_or_create shared lock upgrades)
                try:
                    WorkflowSequence.objects.create(
                        workflow_id=actual_workflow_id,
                        current_sequence=0,
                        current_version=0
                    )
                except IntegrityError:
                    pass  # Row already exists, which is fine
                    
                with transaction.atomic():
                    # 2. Row-level Lock (Primary Key Match) - No Gap Locks!
                    seq = WorkflowSequence.objects.select_for_update().get(workflow_id=actual_workflow_id)
                    
                    next_seq = seq.current_sequence + 1
                    next_version = seq.current_version + 1
                    parent_id = seq.last_event_id
                        
                    event = PipelineEvent.objects.create(
                        record_id=str(record_id),
                        session_id=session_id,
                        status=status,
                        metadata=metadata or {},
                        workflow_id=actual_workflow_id,
                        workflow_version=next_version,
                        event_sequence=next_seq,
                        causation_id=causation_id,
                        correlation_id=actual_correlation_id,
                        parent_event_id=parent_id
                    )
                    
                    # 3. Commit Sequence Advancement
                    seq.current_sequence = next_seq
                    seq.current_version = next_version
                    seq.last_event_id = event.id
                    seq.save(update_fields=['current_sequence', 'current_version', 'last_event_id'])
                    
                break # Success!
            except IntegrityError:
                if attempt == max_retries - 1:
                    raise
                continue
            
        # ── [PHASE 1: DEDICATED QUEUE-DRIVEN PROJECTION] ──
        # ── [PHASE 1: DEDICATED QUEUE-DRIVEN PROJECTION] ──
        from core.sqs import queue_service
        from vouchers.message_factory import message_factory
        
        # Hydrate missing identity fields for Canonical Schema
        actual_session_id = session_id
        actual_tenant_id = tenant_id or "system"
        actual_job_id = str(job_id) if job_id else "unknown"
        try:
            record = InvoiceTempOCR.objects.get(id=record_id)
            actual_session_id = actual_session_id or record.upload_session_id
            actual_tenant_id = record.tenant_id or "system"
            
            # Fetch job_id via OCRTask mapping if missing
            from .models import OCRTask
            task = OCRTask.objects.filter(result_id=record_id).first()
            if task and task.job_id:
                actual_job_id = str(task.job_id)
            else:
                from vouchers.models import InvoiceProcessingItem
                item = InvoiceProcessingItem.objects.filter(staging_record_id=record_id).first()
                if item and item.job_id:
                    actual_job_id = str(item.job_id)
        except Exception:
            actual_session_id = actual_session_id or str(record_id)

        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[MESSAGE_TYPE_REGISTERED] type=MATERIALIZE event_id={event.id}")

        message = message_factory.create_message(
            task_type="MATERIALIZE",
            tenant_id=actual_tenant_id,
            session_id=actual_session_id,
            correlation_id=actual_correlation_id,
            payload={
                "event_id": event.id,
                "record_id": str(record_id),
                "status": status,
                "workflow_id": event.workflow_id,
                "workflow_version": event.workflow_version,
                "job_id": actual_job_id
            }
        )
        
        logger.info(f"[MATERIALIZE_DISPATCH_START] event_id={event.id} record={record_id}")
        logger.info(f"[CONTEXT_TRACE_MATERIALIZE_EMIT] job_id={actual_job_id} record_id={record_id} session_id={actual_session_id} tenant_id={actual_tenant_id} trace_id={message['trace_id']}")
        queue_service.push(message=message, queue_type='materialization')
        logger.info(f"[MATERIALIZE_DISPATCH_SUCCESS] event_id={event.id} record={record_id}")
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"[EVENT_LOG_FAIL] record={record_id} status={status}: {e}")

def rebuild_projection(record_id: str):
    """
    PHASE 6 & 8: REPLAY-SAFE RECONSTRUCTION WITH OBSERVABILITY
    Rebuilds the current projection state purely from the immutable event log.
    Provides determinism during crash recovery or late-arrival reconciliation.
    """
    from django.db import transaction
    from .models import InvoiceTempOCR
    import logging
    import time
    from core.observability import observability, metrics
    logger = logging.getLogger(__name__)

    t_start = time.time()
    try:
        with transaction.atomic():
            events = PipelineEvent.objects.filter(record_id=str(record_id)).order_by('event_sequence')
            if not events.exists():
                logger.warning(f"[REBUILD_SKIPPED] record={record_id} has no events.")
                return False

            # Phase 6: Validate Cryptographic Integrity of Event Stream
            for event in events:
                if event.event_checksum and not event.is_valid():
                    logger.critical(f"[EVENT_CORRUPTION] Event {event.id} failed checksum validation!")
                    observability.alert(event="EVENT_CORRUPTION_DETECTED", record_id=record_id, event_id=event.id)
                    raise ValueError(f"Cryptographic corruption detected in event stream for {record_id}")

            last_event = events.last()
            
            # Deterministic projection update
            updated = InvoiceTempOCR.objects.filter(
                id=record_id,
                workflow_version__lt=last_event.workflow_version
            ).update(
                status=last_event.status,
                workflow_version=last_event.workflow_version
            )
            
            latency = time.time() - t_start
            metrics.record_latency("projection:rebuild_latency", latency, tags={"status": last_event.status})
            metrics.increment_counter("projection:rebuild_count", 1)
            observability.db_metric(event="PROJECTION_REBUILD", record_id=record_id, latency=latency, updated=updated, version=last_event.workflow_version)
            
            logger.info(f"[PROJECTION_REBUILT] record={record_id} to status={last_event.status} version={last_event.workflow_version} updated={updated} latency={latency:.3f}s")
            return updated > 0
    except Exception as e:
        logger.error(f"[REBUILD_FAIL] record={record_id}: {e}")
        metrics.increment_counter("projection:rebuild_error_count", 1)
        return False


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
    is_cancelled = models.BooleanField(default=False)
    upload_type = models.CharField(max_length=50, default='UNKNOWN')
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

    # Phase 14: Batch Success/Quorum Tracking
    status = models.CharField(max_length=50, default='UPLOADED')
    
    expected_records = models.IntegerField(default=0)
    processed_records = models.IntegerField(default=0)
    exported_records = models.IntegerField(default=0)
    materialized_records = models.IntegerField(default=0)
    failed_records = models.IntegerField(default=0)
    
    ingestion_complete = models.BooleanField(default=False)
    ai_complete = models.BooleanField(default=False)
    export_complete = models.BooleanField(default=False)
    materialization_complete = models.BooleanField(default=False)
    snapshot_complete = models.BooleanField(default=False)

    # [MIGRATION 0023] Phase convergence flags
    assembly_complete = models.BooleanField(default=False)
    continuation_merge_complete = models.BooleanField(default=False)
    hydration_ready = models.BooleanField(default=False)
    terminal_consistency = models.BooleanField(default=False)
    validation_complete = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        """
        IMMUTABILITY ENFORCEMENT: Once SessionFinalizationState reaches terminal status,
        block any subsequent attempts to save or modify.
        """
        if self.pk is not None:
            try:
                db_state = SessionFinalizationState.objects.filter(pk=self.pk).values(
                    'status', 'snapshot_created', 'export_complete', 'materialization_complete', 'snapshot_complete'
                ).first()
                if db_state:
                    db_status = db_state.get('status')
                    db_export = db_state.get('export_complete')
                    db_materialize = db_state.get('materialization_complete')
                    db_snapshot = db_state.get('snapshot_complete')
                    db_snapshot_created = db_state.get('snapshot_created')
                    
                    terminal_statuses = {'FINALIZED', 'COMPLETED'}
                    is_final = (
                        db_status in terminal_statuses
                        or (db_status == 'FAILED' and self.status == 'FAILED')
                        or (db_export and db_materialize and db_snapshot)
                    )
                    if is_final:
                        raise RuntimeError(f"Post-finalization mutation blocked on SessionFinalizationState {self.pk}")
            except Exception as e:
                if isinstance(e, RuntimeError):
                    raise
                import logging
                logging.getLogger(__name__).warning(f"[SESSION_STATE_SAVE_GUARD_FAILED] {e}")
        super().save(*args, **kwargs)

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
    upload_type = models.CharField(max_length=50, default='UNKNOWN')
    
    ocr_raw_text = models.TextField(null=True, blank=True)
    extracted_data = models.JSONField(null=True, blank=True) # Source of truth for UI modal
    
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=50, default='PROCESSING')
    processed = models.BooleanField(default=False)
    
    # ── [PHASE 4: VERSION-AWARE PROJECTION SAFETY] ──
    workflow_version = models.BigIntegerField(default=0)
    
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

    IMMUTABLE_VALIDATION_STATUSES = {'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE'}
    OVERWRITE_BLOCKED_STATUSES = {'READY', 'FOUND', 'RESOLVED', 'SUCCESS', 'PENDING', 'NEED_VENDOR', 'VENDOR_MISSING'}

    def save(self, *args, **kwargs):
        """
        IMMUTABILITY ENFORCEMENT: If this record is already marked DUPLICATE,
        block any attempt to overwrite it with a non-DUPLICATE status.
        This is the last-line-of-defense guard regardless of which code path runs.
        """
        import logging
        import inspect
        import json
        from django.utils import timezone
        _log = logging.getLogger(__name__)

        # Auto-update validation_revision in extracted_data before save
        if self.extracted_data is not None:
            if isinstance(self.extracted_data, dict):
                try:
                    from ocr_pipeline.integrity_enforcer import get_dto_hash
                    current_hash = get_dto_hash(self.extracted_data)
                    val_rev = self.extracted_data.get("validation_revision")
                    if not val_rev or not isinstance(val_rev, dict) or val_rev.get("hash") != current_hash:
                        prev_version = 0
                        if val_rev and isinstance(val_rev, dict):
                            prev_version = val_rev.get("version", 0)
                        self.extracted_data["validation_revision"] = {
                            "hash": current_hash,
                            "version": prev_version + 1,
                            "timestamp": timezone.now().isoformat(),
                            "failures": []
                        }
                except Exception as _rev_err:
                    _log.warning(f"[VAL_REV_AUTO_UPDATE_FAILED] {_rev_err}")

        if self.pk is not None:
            # ── [PHASE 4: CANONICAL IMMUTABILITY GUARD] ──
            try:
                db_record = InvoiceTempOCR.objects.filter(pk=self.pk).values('status', 'processed', 'validation_status', 'extracted_data').first()
                if db_record:
                    db_status = db_record.get('status')
                    db_processed = db_record.get('processed')
                    db_val_status = db_record.get('validation_status')
                    db_extracted = db_record.get('extracted_data') or {}
                    
                    # Stack bypass inspection
                    bypass_guard = getattr(self, '_bypass_immutability_guard', False)
                    if not bypass_guard:
                        for frame in inspect.stack():
                            func_name = frame.function
                            if any(k in func_name for k in ('revalidate', 'validate_and_process', 'evaluate_pending_purchase', 'patch', 'process_pending_purchase', 'resolve')):
                                bypass_guard = True
                                break

                    if bypass_guard:
                        _log.info(f"[IMMUTABILITY_GUARD_BYPASS] Legitimate pipeline trigger or bypass flag detected. Bypassing guard for record={self.pk}")

                    if not bypass_guard:
                        # [RESTORATION FIX] A status of 'FINALIZED' is only terminal if processed=True.
                        # If processed=False, the business validation and voucher save has not run yet.
                        is_db_terminal = (db_status == 'COMPLETED') or (db_status == 'FINALIZED' and db_processed)
                        if is_db_terminal and self.status not in {'FINALIZED', 'FAILED', 'COMPLETED', 'VOUCHER_CREATED'}:
                            raise RuntimeError(f"Post-finalization mutation blocked: record {self.pk} is in terminal state '{db_status}'")
                        
                        is_db_finalized = (
                            (db_status in ('FINALIZED', 'COMPLETED') and db_processed)
                            or db_processed is True
                            or db_val_status in ('VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE', 'PENDING_PURCHASE')
                        )
                        
                        if is_db_finalized:
                            # Prevent status/processed oscillation
                            if self.status not in ('FINALIZED', 'FAILED'):
                                _log.warning(f"[IMMUTABILITY_GUARD_BLOCKED] Attempted status regression from {db_status} to {self.status} for record={self.pk}")
                                self.status = db_status
                            if not self.processed and db_processed:
                                _log.warning(f"[IMMUTABILITY_GUARD_BLOCKED] Attempted processed regression from True to False for record={self.pk}")
                                self.processed = True
                            if self.validation_status != db_val_status and db_val_status in ('VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE', 'PENDING_PURCHASE'):
                                _log.warning(f"[IMMUTABILITY_GUARD_BLOCKED] Attempted validation_status regression from {db_val_status} to {self.validation_status} for record={self.pk}")
                                self.validation_status = db_val_status
                            if self.extracted_data != db_extracted:
                                _log.warning(f"[IMMUTABILITY_GUARD_BLOCKED] Attempted post-finalization DTO mutation for record={self.pk}")
                                self.extracted_data = db_extracted
            except Exception as _imm_err:
                if isinstance(_imm_err, RuntimeError):
                    raise
                _log.warning(f"[IMMUTABILITY_GUARD_FAILED] record={self.pk} error={_imm_err}")

            if not getattr(self, '_bypass_immutability_guard', False):
                # Also double check stack bypass for overwrite guard
                bypass_overwrite = False
                for frame in inspect.stack():
                    if any(k in frame.function for k in ('revalidate', 'validate_and_process', 'evaluate_pending_purchase', 'patch', 'process_pending_purchase', 'resolve')):
                        bypass_overwrite = True
                        break
                
                if not bypass_overwrite:
                    current_status = self.validation_status
                    # Fetch actual DB value to check — only if we're about to write something weaker
                    if current_status in self.OVERWRITE_BLOCKED_STATUSES:
                        try:
                            db_val = InvoiceTempOCR.objects.filter(pk=self.pk).values_list('validation_status', flat=True).first()
                            if db_val in self.IMMUTABLE_VALIDATION_STATUSES:
                                _log.error(
                                    f"[READY_OVERWRITE_BLOCKED] id={self.pk} "
                                    f"attempted to write validation_status='{current_status}' "
                                    f"but DB has immutable status='{db_val}'. Write BLOCKED."
                                )
                                # Force back to DUPLICATE so the save proceeds with correct value
                                self.validation_status = db_val
                        except Exception as _e:
                            _log.warning(f"[IMMUTABILITY_CHECK_FAILED] id={self.pk} error={_e}")

            # [FORENSIC_STATUS_MUTATION] Tracing
            try:
                db_record = InvoiceTempOCR.objects.filter(pk=self.pk).values('status', 'validation_status', 'vendor_status').first()
                if db_record:
                    changes = []
                    for field in ('status', 'validation_status', 'vendor_status'):
                        old_val = db_record.get(field)
                        new_val = getattr(self, field)
                        if old_val != new_val:
                            changes.append((field, old_val, new_val))
                    if changes:
                        mutation_stage = "unknown"
                        for frame in inspect.stack():
                            func = frame.function
                            if func not in ('save', 'inner', 'wrapper', '_persist', '_handle_task_inner', '_update_task_status'):
                                mutation_stage = func
                                break
                        for field, old_val, new_val in changes:
                            mutation_info = {
                                "invoice_no": str(self.supplier_invoice_no or ""),
                                "field_name": field,
                                "old_value": str(old_val),
                                "new_value": str(new_val),
                                "mutation_stage": mutation_stage,
                                "dto_memory_id": str(id(self.extracted_data)),
                                "timestamp": timezone.now().isoformat()
                            }
                            _log.info(f"[FORENSIC_STATUS_MUTATION]\n{json.dumps(mutation_info, indent=2, default=str)}")
            except Exception as e:
                _log.warning(f"[FORENSIC_STATUS_MUTATION_TRACING_FAILED] error={e}")

        # [FORENSIC_DB_PERSISTENCE] Tracing
        try:
            operation_type = "INSERT" if self.pk is None else "UPDATE"
            payload_str = json.dumps(self.extracted_data, default=str) if self.extracted_data else "{}"
            persist_info = {
                "invoice_no": str(self.supplier_invoice_no or ""),
                "operation_type": operation_type,
                "payload_size_bytes": len(payload_str),
                "dto_memory_id": str(id(self.extracted_data)),
                "timestamp": timezone.now().isoformat()
            }
            _log.info(f"[FORENSIC_DB_PERSISTENCE]\n{json.dumps(persist_info, indent=2, default=str)}")
        except Exception as e:
            _log.warning(f"[FORENSIC_DB_PERSISTENCE_TRACING_FAILED] error={e}")

        _log.info(
            f"[DUPLICATE_RUNTIME_PROBE] file={__file__} "
            f"id={self.pk} writing validation_status='{self.validation_status}'"
        )
        super().save(*args, **kwargs)

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


class RescanHistory(models.Model):
    """
    Tracks rescan operations performed on InvoiceTempOCR staging records.
    """
    invoice_temp_ocr = models.ForeignKey(
        InvoiceTempOCR, 
        on_delete=models.CASCADE, 
        related_name='rescan_history',
        db_column='invoice_temp_ocr_id'
    )
    timestamp = models.DateTimeField(default=timezone.now)
    rescan_type = models.CharField(max_length=50) # 'ROW' or 'SESSION'
    user = models.CharField(max_length=255, null=True, blank=True)
    reason = models.TextField(null=True, blank=True)
    cost_impact = models.DecimalField(max_digits=10, decimal_places=6, default=0.0)

    class Meta:
        db_table = 'rescan_history'
        verbose_name = "Rescan History"
        verbose_name_plural = "Rescan Histories"


class AIUsageAccounting(models.Model):
    """
    Tracks token counts and costs associated with Gemini AI extraction calls.
    Links back to the staging record and optionally the specific rescan run.
    """
    invoice_temp_ocr = models.ForeignKey(
        InvoiceTempOCR,
        on_delete=models.CASCADE,
        related_name='ai_usages',
        db_column='invoice_temp_ocr_id'
    )
    rescan_history = models.ForeignKey(
        RescanHistory,
        on_delete=models.SET_NULL,
        related_name='ai_usages',
        null=True,
        blank=True,
        db_column='rescan_history_id'
    )
    prompt_tokens = models.IntegerField(default=0)
    completion_tokens = models.IntegerField(default=0)
    total_tokens = models.IntegerField(default=0)
    cost = models.DecimalField(max_digits=10, decimal_places=6, default=0.0)
    created_at = models.DateTimeField(default=timezone.now)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.rescan_history:
            from django.db.models import Sum
            total_cost = AIUsageAccounting.objects.filter(rescan_history=self.rescan_history).aggregate(total=Sum('cost'))['total'] or 0.0
            self.rescan_history.cost_impact = total_cost
            self.rescan_history.save(update_fields=['cost_impact'])

    class Meta:
        db_table = 'ai_usage_accounting'
        verbose_name = "AI Usage Accounting"
        verbose_name_plural = "AI Usage Accountings"

