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

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny

from .models import BulkInvoiceJob, InvoiceProcessingItem
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


        # ── GATE 3: Branch active job limit ──────────────────────────────────
        max_jobs = getattr(settings, 'BULK_MAX_ACTIVE_JOBS_PER_TENANT', 5)
        active = BulkInvoiceJob.objects.filter(
            tenant_id=tenant_id, status__in=['pending', 'processing']
        ).count()
        if active >= max_jobs:
            msg = f"Too many active jobs ({active}/{max_jobs}). Wait for current batch to complete."
            logger.warning(f"[UPLOAD] TENANT LIMIT for {tenant_id}: {active} active")
            return self._busy(msg, 'tenant_limit')

        # ── GATE 4: Batch idempotency (Content-based SHA256) ──────────────────
        all_file_hashes = []
        for f in files:
            content = f.read()
            f.seek(0)
            fh = hashlib.sha256(content).hexdigest()
            print(f"DEBUG: FILE SIZE: {len(content)}, FILE HASH: {fh}")
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
            logger.info(f"[IDEMPOTENCY] In-progress → Job {existing.id}")
            if new_session:
                existing.upload_session_id = new_session
                existing.save()
                   
            if existing.status == 'pending':
                # Re-trigger enqueuing if stuck in pending
                logger.info(f"Re-enqueuing pending job {existing.id}")
                self._enqueue_to_redis(existing, request.data.get('voucher_type', 'Purchase'), tenant_id)

            
            return Response({'status': 'already_processing', 'job_id': existing.id,
                             'total_files': existing.total_files})

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

        paths = []
        import concurrent.futures
        from django.db import connection

        def upload_worker(uploaded_file):
            try:
                uploaded_file.seek(0)
                file_bytes = uploaded_file.read()
                file_hash  = storage.hash_bytes(file_bytes)
                key        = storage.make_key(job.id, uploaded_file.name)
                
                storage.upload_bytes(file_bytes, key)

                # Need separate connection for thread
                master = InvoiceProcessingItem.objects.create(
                    job=job,
                    file_path=key,
                    file_hash=file_hash,
                    status='pending',
                    page_count=1,
                )
                logger.info(f"Registered item {master.id} for Job {job.id}")
                return key
            except Exception as e:
                logger.error(f"Upload worker failed for {uploaded_file.name}: {e}")
                return None
            finally:
                connection.close()

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            results = list(executor.map(upload_worker, files))
            paths = [r for r in results if r]

        # ── PUSH TO REDIS PRIORITY QUEUE ────────────
        voucher_type = request.data.get('voucher_type', 'Purchase')
        return self._enqueue_to_redis(job, voucher_type, tenant_id, paths)

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

        # ── PRIORITY ROUTING ──
        # High: 1-3 pages, Normal: 4-15 pages, Low: 16+ pages
        file_count = job.total_files
        if file_count <= 3:
            p_queue = 'bulk_jobs_high'
        elif file_count <= 15:
            p_queue = 'bulk_jobs_normal'
        else:
            p_queue = 'bulk_jobs_low'

        task = {
            'id': f"bulk_{job.id}",
            'job_id': job.id,
            'voucher_type': voucher_type,
            'tenant_id': tenant_id,
            'file_count': file_count,
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

        pushed = redis_client.push_to_queue(p_queue, task)
        if not pushed:
            logger.error("[REDIS ERROR] Push failed for Job %s", job.id)
            return Response({'error': 'System Error: Failed to enqueue job. Please try again.'}, status=500)

        redis_client.record_metric('bulk_queue_length', q_len + 1)
        logger.info(f"[UPLOAD] Enqueued Bulk Job {job.id} to {p_queue} | session={task['upload_session_id']}")

        return Response({
            'status':   'processing',
            'job_id':   job.id,
            'total_files': file_count,
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
        try:
            job     = BulkInvoiceJob.objects.get(id=job_id)
            masters = job.items.filter(parent_item_id=None)
            total   = masters.count() or job.total_files
            success = masters.filter(status__in=['success', 'partial']).count()
            failed  = masters.filter(status='failed').count()
            pending = masters.filter(status__in=['pending', 'processing']).count()

            if job.status == 'completed' and job.file_hash:
                IdempotencyLock(job.file_hash).mark_done(job.id)

            # Optimization: Calculate progress
            progress = 0
            if total > 0:
                progress = int((success + failed) / total * 100)

            return Response({
                'status':    job.status,
                'progress':  progress,
                'total':     total,
                'processed': success,
                'failed':    failed,
                'pending':   pending,
                'completed': job.status in ['completed', 'failed', 'success']
            })

        except BulkInvoiceJob.DoesNotExist:
            return Response({'error': 'Job not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)
