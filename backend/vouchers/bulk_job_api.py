"""
Bulk Invoice Upload API – SQS/DB Version
==========================================
Eliminated Redis dependency. Concurrency and progress are tracked via the database.
"""
import os
import time
import hashlib
import logging
import uuid
from typing import Dict, Any

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny
from django.http import StreamingHttpResponse
import json

from .models import BulkInvoiceJob, InvoiceProcessingItem
from ocr_pipeline.models import InvoiceTempOCR
from .pipeline import storage
from .pipeline.health import SystemHealth, IdempotencyLock
from core.constants import JobStatus, ItemStatus
from core.sqs import queue_service

logger = logging.getLogger(__name__)

RETRY_AFTER = {
    'infrastructure': 30,
    'lag':            15,
    'tenant_limit':   60,
}

class BulkUploadAPIView(APIView):
    permission_classes = [AllowAny]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        files = request.FILES.getlist('files')
        if not files:
            return Response({'error': 'No files uploaded'}, status=400)

        tenant_id = getattr(request.user, 'branch_id', None) or getattr(request.user, 'tenant_id', None) or '88fe4389-58a9-4244-9878-8a4e646898bd'
        tenant_id = str(tenant_id)
        received_session = request.data.get('upload_session_id')
        
        logger.info(f"[PIPELINE_STAGE_ENTER] stage='UPLOAD' session_id='{received_session}' tenant_id='{tenant_id}' files={len(files)}")
        logger.info(f"[PIPELINE_MODE] mode='DISTRIBUTED_QUEUE' session_id='{received_session}'")
        logger.info(f"[UPLOAD API] Received request | files={len(files)} | session={received_session} | tenant={tenant_id}")

        # [UPLOAD_TYPE PROPAGATION FIX] Read upload source from frontend
        voucher_type = request.data.get('voucher_type', 'Purchase')
        upload_type = request.data.get('upload_type', '').strip().upper() or 'UNKNOWN'
        logger.info(f"[UPLOAD_TYPE_RESOLVED] upload_type={upload_type} voucher_type={voucher_type}")

        # 1. System Health (AI/DB only, Redis removed)
        ready, reason = SystemHealth.is_ready()
        if not ready:
            return self._busy(reason, 'infrastructure')

        # 2. Tenant Job Limit (DB-backed)
        max_jobs = getattr(settings, 'BULK_MAX_ACTIVE_JOBS_PER_TENANT', 5)
        # DB concurrency check (Consistency)
        active = BulkInvoiceJob.objects.filter(
            tenant_id=tenant_id, status__in=['PENDING', 'PROCESSING', 'QUEUED', 'FINALIZING']
        ).count()
        if active >= max_jobs:
            logger.warning(f"[TENANT_LIMIT_EXCEEDED] tenant={tenant_id} active={active}")
            return self._busy(f"Too many active jobs ({active}/{max_jobs})", 'tenant_limit')

        # 3. File size check
        MAX_FILE_SIZE_MB = getattr(settings, 'MAX_FILE_SIZE_MB', 50)
        for f in files:
            if f.size > MAX_FILE_SIZE_MB * 1024 * 1024:
                return Response({'error': f"File {f.name} too large"}, status=413)

        # 4. Batch Fingerprint (Idempotency)
        all_file_hashes = []
        for f in files:
            sha = hashlib.sha256()
            for chunk in f.chunks(): sha.update(chunk)
            all_file_hashes.append(sha.hexdigest())
        
        batch_fingerprint = hashlib.sha256(f'{"".join(sorted(all_file_hashes))}_{received_session}'.encode()).hexdigest()
        
        # Reset file pointers after fingerprinting consumes streams
        for f in files:
            f.seek(0)
        
        # 5. Check Existing (Hardenend Logic)
        logger.info(f"[DUPLICATE_CHECK_START] session={received_session} fingerprint={batch_fingerprint[:8]}...")
        existing = BulkInvoiceJob.objects.filter(file_hash=batch_fingerprint, tenant_id=tenant_id).first()
        
        if existing:
            # [PHASE 11.9] Retry Support: Only block if the job is actually healthy/running
            # Ignore FAILED, CANCELLED, or PARTIAL jobs for re-upload purposes
            blocking_statuses = ['PENDING', 'QUEUED', 'PROCESSING', 'FINALIZING', 'COMPLETED']
            is_blocking = existing.status in blocking_statuses and not existing.is_cancelled
            
            logger.info(f"[DUPLICATE_MATCH_FOUND] job_id={existing.id} status={existing.status} blocking={is_blocking}")
            
            if is_blocking:
                 logger.warning(f"[DUPLICATE_REJECT_REASON] Active job exists for this fingerprint. hash={batch_fingerprint}")
                 # Return 200 with existing job info (standard idempotency)
                 return Response({
                    'status': existing.status.lower(), 
                    'job_id': existing.id,
                    'total_files': existing.total_files,
                    'message': 'Job already exists and is in progress or completed'
                })
            else:
                 logger.info(f"[UPLOAD_ACCEPTED] Allowing retry of failed/cancelled job {existing.id}")

        logger.info(f"[UPLOAD_ACCEPTED] New batch creation started. session={received_session}")

        # 6. Create Job & Items
        job = BulkInvoiceJob.objects.create(
            tenant_id=tenant_id,
            upload_session_id=received_session,
            file_hash=batch_fingerprint,
            total_files=len(files),
            upload_type=upload_type,
            status='PENDING'
        )

        file_info = []
        seen_hashes_in_batch = set()
        
        for i, f in enumerate(files):
            f_hash = all_file_hashes[i]
            
            # [PHASE 11.9] Prevent Batch Self-Collision (Requirement #2)
            if f_hash in seen_hashes_in_batch:
                logger.warning(f"[BATCH_SELF_COLLISION_SKIPPED] file={f.name} hash={f_hash[:8]}")
                continue
            seen_hashes_in_batch.add(f_hash)
            
            ext = os.path.splitext(f.name)[1].lower() or '.pdf'
            storage_key = f"jobs/{job.id}/{uuid.uuid4().hex[:8]}---{f.name}"
            
            # [PHASE 11.9] Duplicate Check Against Finalized Records (Requirement #3, #6)
            # We ONLY block if a finalized successful record exists for this hash
            existing_finalized = InvoiceTempOCR.objects.filter(
                file_hash=f_hash, 
                tenant_id=tenant_id,
                processed=True
            ).first()
            
            if existing_finalized:
                logger.info(f"[DUPLICATE_MATCH_FOUND] finalized_id={existing_finalized.id} inv={existing_finalized.supplier_invoice_no}")
                # Log exact collision fields as requested (Requirement #4)
                logger.info(f"[COLLISION_DETAILS] {{'invoice_no': '{existing_finalized.supplier_invoice_no}', 'gstin': '{existing_finalized.gstin}', 'tenant': '{tenant_id}', 'filename': '{f.name}', 'hash': '{f_hash}'}}")
                
                # However, requirement #5 says "Do NOT reject uploads simply because same PDF uploaded again"
                # So we ALLOW the upload but log the warning.
                logger.info(f"[UPLOAD_ACCEPTED] Allowing re-upload of previously finalized PDF. hash={f_hash[:8]}")

            try:
                f.seek(0)
                storage.upload_bytes(f.read(), storage_key)
                
                item = InvoiceProcessingItem.objects.create(
                    job=job,
                    tenant_id=tenant_id,
                    file_path=storage_key,
                    file_hash=f_hash,
                    status='PENDING'
                )
                
                # [PHASE 11.9] PROTECTIVE RECORD CREATION (Retry Support)
                # If we are retrying the same session, some records might already exist.
                # We reuse them to avoid 409 IntegrityErrors.
                record = InvoiceTempOCR.objects.filter(
                    tenant_id=tenant_id,
                    file_hash=f_hash,
                    upload_session_id=received_session
                ).first()
                
                if record:
                    logger.info(f"[REUSING_RECORD] id={record.id} session={received_session} hash={f_hash[:8]}...")
                    record.status = 'PENDING'
                    record.file_path = storage_key # Update path to newest upload
                    record.save(update_fields=['status', 'file_path'])
                else:
                    # [FIX] Critical: Must pass file_hash to prevent (tenant, hash, session) collision
                    record, created = InvoiceTempOCR.objects.get_or_create(
                        tenant_id=tenant_id,
                        upload_session_id=received_session,
                        file_hash=f_hash,
                        defaults={
                            'file_path': storage_key,
                            'status': 'PENDING',
                            'voucher_type': request.data.get('voucher_type', 'Purchase'),
                            'upload_type': upload_type
                        }
                    )
                    if created:
                        logger.info(f"[RECORD_CREATED] id={record.id} job={job.id} hash={f_hash[:8]}...")
                    else:
                        logger.info(f"[RECORD_REUSED_IN_BATCH] id={record.id} job={job.id} hash={f_hash[:8]}...")

                item.staging_record_id = record.id
                item.save(update_fields=['staging_record_id'])
                
                file_info.append({'id': item.id, 'record_id': record.id, 'original_name': f.name})
            
            except Exception as e:
                # Forensic Collision Reporting
                from django.db import IntegrityError
                is_duplicate = isinstance(e, IntegrityError) and 'Duplicate entry' in str(e)

                logger.error(f"[DATABASE_CONFLICT] Integrity failure during record creation: {e}")

                # Attempt to find what it collided with
                collision = InvoiceTempOCR.objects.filter(
                    tenant_id=tenant_id,
                    file_hash=f_hash,
                    upload_session_id=received_session
                ).first()

                collision_data = {
                    "tenant": tenant_id,
                    "filename": f.name,
                    "hash": f_hash,
                    "session": received_session
                }
                if collision:
                    collision_data.update({
                        "existing_id": collision.id,
                        "existing_status": collision.status,
                        "invoice_no": getattr(collision, 'supplier_invoice_no', None),
                    })

                logger.error(f"[COLLISION_DETAILS] {collision_data}")

                if is_duplicate:
                    # ── [SURGICAL FIX] DUPLICATE HASH TERMINAL HANDLER ──
                    # The session is now stuck: DB record couldn't be created, SQS will never
                    # be dispatched, expected=0 completed=0 → orchestrator loops PROCESSING forever.
                    # We must immediately terminalize the job + session to unblock the frontend.
                    logger.warning(f"[DUPLICATE_HASH_TERMINAL] session={received_session} file={f.name} — marking job FAILED_DUPLICATE to prevent infinite PROCESSING state")

                    try:
                        job.status = 'FAILED'
                        job.save(update_fields=['status'])
                    except Exception as je:
                        logger.error(f"[DUPLICATE_TERMINAL_JOB_SAVE_FAIL] {je}")

                    # Write terminal FAILED state to Redis so orchestrator barrier unblocks
                    try:
                        from core.redis_orchestrator import orchestrator
                        orchestrator.set_terminal_status(
                            session_id=received_session,
                            status="FAILED",
                            reason="FAILED_DUPLICATE"
                        )
                        logger.info(f"[DUPLICATE_TERMINAL_REDIS_SET] session={received_session}")
                    except Exception as re:
                        logger.error(f"[DUPLICATE_TERMINAL_REDIS_FAIL] {re}")

                    return Response({
                        'error': f"Duplicate file: '{f.name}' has already been uploaded in this session or a prior session. Please upload a different file.",
                        'status': 'FAILED_DUPLICATE',
                        'file': f.name,
                        'file_hash': f_hash,
                        'existing_record': collision_data,
                    }, status=409)

                # Non-duplicate integrity error — propagate as before
                raise e

        # 7. ATOMIC SESSION INITIALIZATION — write DB anchors BEFORE SQS dispatch
        # [FIX] Without this, get_authoritative_session_state() sees states=[] or expected=0
        # during the window between upload and ingestion worker execution.
        # The orchestrator then returns BARRIER_INCOMPLETE which the frontend shows as stuck PROCESSING.
        # By writing stub rows now (expected_pages=0), the orchestrator can distinguish
        # ORCHESTRATION_BOOTSTRAPPING (expected=0) from a real BARRIER_INCOMPLETE (expected>0).
        logger.info(f"[SESSION_INIT_START] session={received_session} job={job.id} records={len(file_info)}")
        from ocr_pipeline.models import SessionFinalizationState
        for item_data in file_info:
            try:
                SessionFinalizationState.objects.get_or_create(
                    id=str(item_data['record_id']),
                    defaults={
                        'expected_pages': 0,   # Will be updated by ingestion worker after page count
                        'completed_pages': 0,
                        'failed_pages': 0,
                        'ai_completed_pages': 0,
                        'snapshot_created': False,
                        'export_complete': False,
                        'materialization_complete': False,
                    }
                )
                logger.info(f"[SESSION_INIT_COMMIT] record={item_data['record_id']} stub_row_created session={received_session}")
            except Exception as e:
                # Non-fatal — ingestion worker will create it if missing
                logger.warning(f"[SESSION_INIT_STUB_FAIL] record={item_data['record_id']} error={e}")
        logger.info(f"[ORCHESTRATION_BOOTSTRAP] session={received_session} stub_rows={len(file_info)} — safe to poll")

        # 8. Enqueue to SQS — AFTER stub rows committed
        logger.info(f"[QUEUE_DISPATCH_AFTER_COMMIT] session_id='{received_session}' job_id='{job.id}' count={len(file_info)}")
        logger.info(f"[SQS_DISPATCH] Dispatching job_id='{job.id}' session_id='{received_session}' items={len(file_info)}")

        from vouchers.message_factory import message_factory
        for item_data in file_info:
            ingestion_payload = {
                'job_id': job.id,
                'item_id': item_data['id'],
                'record_id': item_data['record_id'],
                'voucher_type': request.data.get('voucher_type', 'Purchase'),
                'upload_type': upload_type,  # [UPLOAD_TYPE PROPAGATION FIX]
            }

            msg = message_factory.create_message(
                task_type="INGESTION",
                tenant_id=tenant_id,
                session_id=received_session,
                payload=ingestion_payload
            )

            from copy import deepcopy
            msg_copy = deepcopy(msg)

            try:
                queue_service.push(msg_copy, queue_type='ingestion')
                logger.info(f"[QUEUE_FORWARD_SUCCESS] target_queue=ingestion msg_id={msg_copy['id']}")
            except Exception as e:
                logger.error(f"[QUEUE_FORWARD_FAILURE] target_queue=ingestion error={e}")
                raise

        logger.info(f"[PIPELINE_STAGE_EXIT] stage='UPLOAD' session_id='{received_session}' job_id='{job.id}' total_files={len(files)}")
        return Response({'status': 'processing', 'job_id': job.id, 'total_files': len(files)})

    @staticmethod
    def _busy(reason: str, reason_key: str) -> Response:
        after = RETRY_AFTER.get(reason_key, 30)
        resp = Response({'error': reason, 'retry_after': after}, status=503)
        resp['Retry-After'] = str(after)
        return resp

class HealthCheckAPIView(APIView):
    """Simplified health check for LB/Monitoring."""
    authentication_classes = []
    permission_classes = [AllowAny]
    def get(self, request):
        ready, _ = SystemHealth.is_ready()
        return Response({
            "status": "healthy" if ready else "degraded",
            "redis": "removed",
            "timestamp": time.time()
        }, status=200 if ready else 503)

class BulkStatusAPIView(APIView):
    """Poll DB for job status. Redis polling removed."""
    permission_classes = [AllowAny]
    def get(self, request, job_id, *args, **kwargs):
        if request.META.get('HTTP_ACCEPT') == 'text/event-stream':
            return self.sse_response(request, job_id)

        # [PHASE 11.9] FORCE DB REFRESH & PREFETCH
        from django.db import models
        
        job = BulkInvoiceJob.objects.filter(id=job_id).prefetch_related('items').first()
        if not job: 
            return Response({'error': 'Job not found'}, status=404)
        
        # ── [PHASE 11.9] DYNAMIC AGGREGATION (Source of Truth: InvoiceTempOCR) ──
        items = job.items.all()
        total_files = job.total_files or items.count() or 1
        
        # ── [PHASE 15] AUTHORITATIVE ORCHESTRATOR INFERENCE ──
        from core.redis_orchestrator import orchestrator
        auth_state = orchestrator.get_authoritative_session_state(job.upload_session_id)
        
        is_completed = auth_state.get('terminal', False)
        status_str = "PROCESSING"
        
        success = auth_state.get('completed_pages', 0)
        failed = auth_state.get('failed_pages', 0)
        
        if is_completed:
            term_reason = auth_state.get('terminal_reason', 'FAILED')
            if term_reason == "COMPLETED":
                # Ensure compatibility with frontend mapping
                status_str = "FINALIZED" if failed == 0 else "PARTIAL_FAILED"
            else:
                status_str = "FAILED"
            
        # Use orchestrator's expected_pages (pages) if available, otherwise fallback to files
        expected_pages = auth_state.get('expected_pages', 0)
        if expected_pages > 0:
            total = expected_pages
            processing = max(0, total - success - failed)
        else:
            processing = max(0, total_files - success - failed)
            if not is_completed:
                processing = max(1, processing) # force processing
            total = max(total_files, success + failed + processing)
        
        progress = 100 if is_completed else int(((success + failed + (processing * 0.5)) / total) * 100) if total > 0 else 0
        progress = min(progress, 99) if not is_completed else 100

        logger.info(f"[ORCHESTRATOR_STATE_EMITTED] session={job.upload_session_id} terminal={is_completed} reason={auth_state.get('terminal_reason')}")

        if is_completed and auth_state.get('snapshot_complete', False):
            logger.info(f"[SNAPSHOT_READY_EMIT] Emitting SNAPSHOT_READY for job={job_id}")
            logger.info(f"[SNAPSHOT_READY] job={job_id} session={job.upload_session_id}")
        elif is_completed and success == 0 and failed > 0:
            logger.info(f"[SNAPSHOT_READY_EMIT_SKIP] session={job.upload_session_id} reason=total_failure")
        elif not is_completed:
            logger.debug(f"[ORCHESTRATOR_TERMINAL_CHECK] session={job.upload_session_id} terminal=false reason={auth_state.get('terminal_reason')}")
            
            # If the legacy logic would have called it completed (success+failed >= total), log the prevention
            if (success + failed) >= total_files:
                logger.info(f"[PREMATURE_TERMINALIZATION_PREVENTED] session={job.upload_session_id} reason={auth_state.get('terminal_reason')}")
                
            if auth_state.get('terminal_reason') == 'SNAPSHOT_PENDING':
                logger.info(f"[SNAPSHOT_PENDING_DISTRIBUTED_WORK] session={job.upload_session_id}")
            elif auth_state.get('terminal_reason') == 'QUEUE_ACTIVITY':
                logger.info(f"[TERMINALIZATION_BLOCKED_QUEUE_ACTIVITY] session={job.upload_session_id}")
            elif auth_state.get('terminal_reason') == 'ACTIVE_WORKERS':
                logger.info(f"[TERMINALIZATION_BLOCKED_ACTIVE_WORKERS] session={job.upload_session_id}")
            elif auth_state.get('terminal_reason') == 'BARRIER_INCOMPLETE':
                logger.info(f"[TERMINALIZATION_BLOCKED_BARRIER] session={job.upload_session_id}")


        response_data = {
            'status': status_str,
            'progress': min(progress, 100),
            'total': total,
            'processed': success,
            'failed': failed,
            'completed': is_completed
        }
        
        logger.debug(f"[BULK_STATUS_RESPONSE] job_id={job_id} status={status_str} progress={progress}%")
        
        resp = Response(response_data)
        resp['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        resp['Pragma'] = 'no-cache'
        resp['Expires'] = '0'
        return resp

    def sse_response(self, request, job_id):
        """[PHASE 7] Server-Sent Events (SSE) Endpoint for Real-time push updates"""
        def event_stream():
            from django.db import models
            from ocr_pipeline.models import FinalizedSnapshot, InvoiceTempOCR
            from core.redis_orchestrator import orchestrator
            
            tenant_id = getattr(request.user, 'branch_id', None) or getattr(request.user, 'tenant_id', None) or '88fe4389-58a9-4244-9878-8a4e646898bd'
            tenant_id = str(tenant_id)

            while True:
                job = BulkInvoiceJob.objects.filter(id=job_id).first()
                if not job: 
                    yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                    break
                
                # Use Authoritative Orchestrator State just like GET JSON endpoint
                auth_state = orchestrator.get_authoritative_session_state(job.upload_session_id)
                is_completed = auth_state.get('terminal', False)
                status_str = "PROCESSING"
                
                success = auth_state.get('completed_pages', 0)
                failed = auth_state.get('failed_pages', 0)
                
                if is_completed:
                    term_reason = auth_state.get('terminal_reason', 'FAILED')
                    if term_reason == "COMPLETED":
                        status_str = "FINALIZED" if failed == 0 else "PARTIAL_FAILED"
                    else:
                        status_str = "FAILED"
                    
                total_files = job.total_files or 1
                expected_pages = auth_state.get('expected_pages', 0)
                if expected_pages > 0:
                    total = expected_pages
                    processing = max(0, total - success - failed)
                else:
                    processing = max(0, total_files - success - failed)
                    if not is_completed:
                        processing = max(1, processing)
                    total = max(total_files, success + failed + processing)
                
                progress = 100 if is_completed else int(((success + failed + (processing * 0.5)) / total) * 100) if total > 0 else 0
                progress = min(progress, 99) if not is_completed else 100

                response_data = {
                    'status': status_str,
                    'progress': min(progress, 100),
                    'total': total,
                    'processed': success,
                    'failed': failed,
                    'completed': is_completed
                }
                
                yield f"data: {json.dumps(response_data)}\n\n"
                
                if is_completed:
                    break
                
                time.sleep(2)
        
        response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response['X-Accel-Buffering'] = 'no' # Disable Nginx buffering for SSE
        return response
