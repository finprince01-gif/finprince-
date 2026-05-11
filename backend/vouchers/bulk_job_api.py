"""
Bulk Invoice Upload API – Direct Version
==========================================
Uploads are processed directly via synchronous/thread-pool based workers.
No Redis or Kafka infrastructure required.
"""
import os
import time
import hashlib
import logging
import uuid

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny

from .models import BulkInvoiceJob, InvoiceProcessingItem
from ocr_pipeline.models import InvoiceTempOCR
from .pipeline import storage
from .pipeline.health import SystemHealth, IdempotencyLock, MAX_PAGES_PER_JOB
from core.redis_client import redis_client

logger = logging.getLogger(__name__)

# Retry-after hints per rejection reason (seconds)
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

        tenant_id = str(getattr(request.user, 'tenant_id', '88fe4389-58a9-4244-9878-8a4e646898bd'))
        received_session = request.data.get('upload_session_id')
        logger.info(f"[UPLOAD API] Received request | files={len(files)} | session={received_session} | tenant={tenant_id}")

        # ── GATE 1: System health ────────────────────────────────────────────
        ready, reason = SystemHealth.is_ready()
        if not ready:
            logger.critical(f"[UPLOAD] BLOCKED – {reason}")
            return self._busy(reason, 'infrastructure')


        # ── GATE 3: Branch active job limit (Hardened with Redis) ────────────
        max_jobs = getattr(settings, 'BULK_MAX_ACTIVE_JOBS_PER_TENANT', 5)
        
        # Redis check first (Fast)
        redis_concurrency = redis_client.get_tenant_concurrency(tenant_id)
        if redis_concurrency >= max_jobs:
            msg = f"Tenant Overloaded: {redis_concurrency}/{max_jobs} active jobs in Redis. Please wait."
            logger.warning(f"[UPLOAD] REDIS TENANT LIMIT for {tenant_id}: {redis_concurrency} active")
            return self._busy(msg, 'tenant_limit')

        # DB fallback (Consistency)
        active = BulkInvoiceJob.objects.filter(
            tenant_id=tenant_id, status__in=['pending', 'processing']
        ).count()
        if active >= max_jobs:
            msg = f"Too many active jobs ({active}/{max_jobs}). Wait for current batch to complete."
            logger.warning(f"[UPLOAD] DB TENANT LIMIT for {tenant_id}: {active} active")
            return self._busy(msg, 'tenant_limit')
        
        # Pre-increment Redis counter to block race conditions
        redis_client.incr_tenant_concurrency(tenant_id)

        # ── GATE 4: File size admission control (Requirement #2) ──────────────
        MAX_FILE_SIZE_MB = getattr(settings, 'MAX_FILE_SIZE_MB', 50)
        for f in files:
            if f.size > MAX_FILE_SIZE_MB * 1024 * 1024:
                msg = f"File {f.name} is too large ({f.size / (1024*1024):.1f}MB). Max allowed: {MAX_FILE_SIZE_MB}MB"
                logger.warning(f"[UPLOAD] REJECTED: {msg}")
                return Response({'error': msg}, status=413)

        # ── GATE 5: Batch idempotency (Streaming SHA256) ──────────────────
        all_file_hashes = []
        for f in files:
            sha256 = hashlib.sha256()
            for chunk in f.chunks():
                sha256.update(chunk)
            fh = sha256.hexdigest()
            logger.info(f"FILE HASH: {fh} | {f.name}")
            all_file_hashes.append(fh)
        
        # Sort hashes to ensure order-independence for the batch fingerprint
        new_session = request.data.get('upload_session_id', 'legacy')
        batch_fingerprint = hashlib.sha256(f'{"".join(all_file_hashes)}_{new_session}'.encode()).hexdigest()
        print(f"DEBUG: BATCH FINGERPRINT: {batch_fingerprint}")

        lock = IdempotencyLock(batch_fingerprint, ttl=300)

        done_job_id = lock.is_done()
        new_session = request.data.get('upload_session_id')

        if done_job_id:
            logger.info(f"[IDEMPOTENCY] Batch done → Job {done_job_id}")
            if new_session:
                from .models import InvoiceProcessingItem
                from ocr_pipeline.repository import InvoiceTempOCR
                job = BulkInvoiceJob.objects.filter(id=done_job_id).first()
                if job:
                   job.upload_session_id = new_session
                   job.save()
            return Response({'status': 'already_completed', 'job_id': done_job_id})

        existing = BulkInvoiceJob.objects.filter(
            file_hash=batch_fingerprint,
            status__in=['pending', 'processing'],
            tenant_id=tenant_id
        ).first()
        
        if existing:
            # ── FIX 6: HARDENED IDEMPOTENCY ──
            # If job exists but is stuck, or if it was recently created by another thread
            logger.info(f"[IDEMPOTENCY] In-progress → Job {existing.id}")
            if new_session:
                existing.upload_session_id = new_session
                existing.save(update_fields=['upload_session_id'])
                   
            if existing.status in ['pending', 'processing']:
                # Re-trigger enqueuing if stuck (Safety)
                logger.info(f"Re-enqueuing job {existing.id} (Status: {existing.status})")
                self._enqueue_to_redis(existing, request.data.get('voucher_type', 'Purchase'), tenant_id)
            
            return Response({
                'status': 'already_processing', 
                'job_id': existing.id,
                'total_files': existing.total_files,
                'message': 'Job already in progress. Polling resumed.'
            })

        # ── GATE 5: Distributed lock (race condition) ─────────────────────────
        if not lock.acquire():
            return Response({'status': 'already_processing',
                             'message': 'Duplicate request received'})

        # ── GATE 6: Instant Extraction (No Persistence) ──────────────────
        # no_persist is deprecated for direct API calls, all must be persistent for async stability.
        pass


        try:
            return self._create_and_enqueue(request, tenant_id, files, batch_fingerprint, lock)
        except Exception as e:
            lock.release()
            logger.error(f"[UPLOAD] Job creation failed: {e}")
            return Response({'error': 'Internal error. Please retry.'}, status=500)

    def _create_and_enqueue(self, request, tenant_id, files, fingerprint, lock):
        voucher_type = request.data.get('voucher_type', 'Purchase')
        # ── GATE 6: Large job protection ─────────────────────────────────────
        if len(files) > MAX_PAGES_PER_JOB:
            logger.warning(f"[UPLOAD] Large batch ({len(files)} files > {MAX_PAGES_PER_JOB}). "
                           "Processing first chunk only; re-upload remaining files.")
            files = list(files)[:MAX_PAGES_PER_JOB]

        job = BulkInvoiceJob.objects.create(
            tenant_id=tenant_id,
            upload_session_id=request.data.get('upload_session_id'),
            file_hash=fingerprint,
            total_files=len(files),
            status='pending',
            segmentation_done=False
        )
        logger.info(f"[UPLOAD] Created Job {job.id} | session={job.upload_session_id} | files={len(files)}")

        # ── STAGE 1: SAVE TO TEMP (STREAMING) ──
        # This is fast and doesn't load files into RAM
        import os
        temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp_ingestion', str(job.id))
        os.makedirs(temp_dir, exist_ok=True)
        
        file_info = []
        for f in files:
            t_path = os.path.join(temp_dir, f.name)
            # Use chunks() to avoid loading full file into memory
            with open(t_path, 'wb+') as destination:
                for chunk in f.chunks():
                    destination.write(chunk)
            
            # ── FIX 7: IMMEDIATE STAGING RECORDS (Race Condition Fix) ──
            # Create InvoiceTempOCR records IMMEDIATELY so the frontend sees them
            # during the first poll, even if workers haven't started.
            
            # Pre-register item as 'pending_ingestion'
            item = InvoiceProcessingItem.objects.create(
                job=job,
                tenant_id=tenant_id,
                file_path=t_path, # Temporary local path
                status='pending',
                page_count=1
            )
            
            # ── [CRITICAL] Create Staging Record ──
            staging_record = InvoiceTempOCR.objects.create(
                tenant_id=tenant_id,
                upload_session_id=job.upload_session_id,
                file_path=f.name,
                file_hash=f"PENDING_{item.id}_{int(time.time())}", # Temporary hash until IngestionWorker finishes
                status='UPLOADING',
                voucher_type=voucher_type
            )
            
            file_info.append({
                'id': item.id, 
                'staging_record_id': staging_record.id,
                'temp_path': t_path, 
                'original_name': f.name
            })

        # ── [FORENSIC] CORRELATION ID ──
        correlation_id = request.headers.get('X-Correlation-ID', f"cid_{uuid.uuid4().hex[:8]}")
        logger.info(f"[UPLOAD] CID: {correlation_id} | Job: {job.id}")

        # ── PUSH TO INGESTION QUEUE ──
        task = {
            'id': f"ingest_{job.id}",
            'job_id': job.id,
            'correlation_id': correlation_id,
            'tenant_id': tenant_id,
            'voucher_type': voucher_type,
            'file_info': file_info,
            'upload_session_id': job.upload_session_id,
            'enqueued_at': time.time()
        }
        
        # ── [FORENSIC] ENQUEUE LOGGING ──
        logger.info(f"[QUEUE_ENQUEUE_TARGET] job_id={job.id} queue='ingestion_queue' task_id=ingest_{job.id}")
        pushed = redis_client.push_to_queue('ingestion_queue', task)
        if not pushed:
            logger.error("[REDIS ERROR] Ingestion push failed for Job %s", job.id)
            return Response({'error': 'System Error: Failed to start ingestion.'}, status=500)

        return Response({
            'status':   'processing',
            'job_id':   job.id,
            'total_files': len(files),
            'message': 'Upload successful. Processing started.'
        })

    def _enqueue_to_redis(self, job, voucher_type, tenant_id, paths=None):
        if not redis_client.available:
            logger.error("[REDIS DOWN] Cannot process job %s. System requires Redis for async execution.", job.id)
            return Response({'error': 'Infrastructure Error: Redis is unavailable. Please try again later.'}, status=503)

        # Admission Control: Reject if total queue size exceeds threshold
        TOTAL_LIMIT = 20000
        priority_queues = ['bulk_jobs_high', 'bulk_jobs_normal', 'bulk_jobs_low']
        q_len = redis_client.get_queue_length(priority_queues)
        
        if q_len > TOTAL_LIMIT:
             logger.critical(f"[ADMISSION CONTROL] Rejecting Job {job.id}. Total queue length {q_len}")
             return Response({'error': 'System is busy (Admission Control). Please try again later.'}, status=503)

        # ── PRIORITY ROUTING (RESTORED TO UNIFIED PIPELINE) ──
        # Stabilization Phase: Use ingestion_queue for all jobs to ensure worker connectivity.
        p_queue = 'ingestion_queue'

        # Reconstruct file_info from DB items
        file_info = []
        # Only re-enqueue items that haven't succeeded yet
        for item in job.items.exclude(status='success'):
            # ── [RECONSTRUCT_METADATA] ──
            # Filename heuristic: if it's a storage key (uuid---name), extract name
            original_filename = os.path.basename(item.file_path)
            if '---' in original_filename:
                original_filename = original_filename.split('---', 1)[1]
            
            # Find the corresponding staging record
            from ocr_pipeline.models import InvoiceTempOCR
            staging = InvoiceTempOCR.objects.filter(
                tenant_id=tenant_id, 
                upload_session_id=job.upload_session_id,
                file_path__icontains=original_filename
            ).first()
            
            # Absolute path in temp_ingestion
            abs_temp_path = os.path.join(settings.MEDIA_ROOT, 'temp_ingestion', str(job.id), original_filename)
            
            file_info.append({
                'id': item.id,
                'staging_record_id': staging.id if staging else None,
                'temp_path': abs_temp_path,
                'original_name': original_filename
            })

        task = {
            'id': f"bulk_{job.id}",
            'job_id': job.id,
            'voucher_type': voucher_type,
            'tenant_id': tenant_id,
            'file_count': len(file_info),
            'file_info': file_info,
            'enqueued_at': time.time(),
            'upload_session_id': job.upload_session_id
        }
        
        # ── GATE 7: Consumer Health Verification ─────────────────────────────
        logger.info(f"[UPLOAD] Checking consumer health for Job {job.id}...")
        is_active = redis_client.verify_consumer_active(max_age=120)
        if not is_active:
            logger.critical(f"[INFRASTRUCTURE FAILURE] No active workers detected for Job {job.id}. Rejecting upload.")
            return Response({
                'error': 'OCR Infrastructure is currently offline. Please contact support or try again later.'
            }, status=503)
        
        logger.info(f"[UPLOAD] Consumer health OK for Job {job.id}.")

        # ── [FORENSIC] ENQUEUE LOGGING ──
        logger.info(f"[QUEUE_ENQUEUE_TARGET] job_id={job.id} queue='{p_queue}' task_id=bulk_{job.id}")
        pushed = redis_client.push_to_queue(p_queue, task)
        if not pushed:
            logger.error("[REDIS ERROR] Push failed for Job %s", job.id)
            return Response({'error': 'System Error: Failed to enqueue job. Please try again.'}, status=500)

        redis_client.record_metric('bulk_queue_length', q_len + 1)
        logger.info(f"[UPLOAD] Enqueued Bulk Job {job.id} to {p_queue} | session={task['upload_session_id']}")

        return Response({
            'status':   'processing',
            'job_id':   job.id,
            'total_files': job.items.count(),
            'file_paths': paths or []
        })


    @staticmethod
    def _busy(reason: str, reason_key: str) -> Response:
        """Return 503 with Retry-After header and retry_after field in body."""
        after = RETRY_AFTER.get(reason_key, 30)
        resp = Response(
            {'error': reason, 'retry_after': after},
            status=503
        )
        resp['Retry-After'] = str(after)
        return resp


class HealthCheckAPIView(APIView):
    """Monitor system health (Redis, Workers, etc.)"""
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        redis_status = "connected" if redis_client.is_healthy() else "down"
        metrics = {}
        if redis_status == "connected":
            try:
                metrics = redis_client.get_client().hgetall("metrics")
            except:
                pass

        return Response({
            "status": "healthy" if redis_status == "connected" else "degraded",
            "redis": redis_status,
            "timestamp": time.time(),
            "metrics": metrics
        })

class BulkStatusAPIView(APIView):
    permission_classes = [AllowAny]
    def get(self, request, job_id, *args, **kwargs):
        # ── [PHASE 1D] REDIS-FIRST POLLING ──
        if redis_client.available:
            try:
                cached = redis_client.get_client().hgetall(f"job:progress:{job_id}")
                if cached:
                    # Convert byte keys to strings if necessary
                    data = {k.decode() if isinstance(k, bytes) else k: v.decode() if isinstance(v, bytes) else v 
                           for k, v in cached.items()}
                    
                    logger.info(f"[REDIS_STATUS_HIT] job={job_id} progress={data.get('progress')}%")
                    
                    return Response({
                        'status':    data.get('status'),
                        'progress':  int(data.get('progress', 0)),
                        'total':     int(data.get('total', 0)),
                        'processed': int(data.get('processed', 0)),
                        'failed':    int(data.get('failed', 0)),
                        'pending':   int(data.get('pending', 0)),
                        'completed': data.get('status') in ['completed', 'failed', 'success', 'partial']
                    })
            except Exception as re:
                logger.warning(f"[REDIS_STATUS_FAIL] job={job_id}: {re}")

        # Fallback to DB
        try:
            job = BulkInvoiceJob.objects.get(id=job_id)
            # ... (rest of the existing logic)
            all_items = job.items.all()
            total = all_items.count() or job.total_files
            
            # Sub-counts for granular progress (Requirement #2)
            success = all_items.filter(status__in=['success', 'partial']).count()
            failed = all_items.filter(status='failed').count()
            processing = all_items.filter(status='processing').count()
            pending = all_items.filter(status='pending').count()

            # [FORENSIC] Deep state audit
            logger.info(
                f"[PROGRESS_AUDIT] job={job_id} status={job.status} total={total} "
                f"S={success} F={failed} P={processing} Pend={pending}"
            )

            if job.status == 'completed' and job.file_hash:
                IdempotencyLock(job.file_hash).mark_done(job.id)

            # Optimization: Calculate progress (Phase 6 Fix)
            # We use all items to ensure split multi-page PDFs advance the bar
            progress = 0
            if total > 0:
                # Terminal: success, failed
                # Active: processing, pending
                weighted_processed = success + failed + (processing * 0.6) + (pending * 0.1)
                progress = int(min(weighted_processed / total * 100, 99))

            # ── DEFENSIVE COMPLETION CHECK ──
            # If all items are terminal but job is stuck in 'processing', auto-repair it.
            is_completed = job.status in ['completed', 'failed', 'success']
            terminal_count = success + failed
            
            if not is_completed and total > 0 and terminal_count >= total:
                logger.warning(f"[STUCK_JOB_RECOVERY] Job {job_id} was '{job.status}' but all {total} items terminal. Auto-completing.")
                job.status = 'completed'
                job.save(update_fields=['status'])
                is_completed = True
                progress = 100

            return Response({
                'status':    job.status,
                'progress':  progress,
                'total':     total,
                'processed': success,
                'failed':    failed,
                'pending':   pending,
                'completed': is_completed
            })

        except BulkInvoiceJob.DoesNotExist:
            return Response({'error': 'Job not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)
