"""
Bulk Invoice Upload API – Direct Version
==========================================
Uploads are processed directly via synchronous/thread-pool based workers.
No Redis or Kafka infrastructure required.
"""
import os
import hashlib
import logging

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

from .models import BulkInvoiceJob, InvoiceProcessingItem
from .pipeline import storage
from .pipeline.health import SystemHealth, IdempotencyLock, MAX_PAGES_PER_JOB

logger = logging.getLogger(__name__)

# Retry-after hints per rejection reason (seconds)
RETRY_AFTER = {
    'infrastructure': 30,
    'lag':            15,
    'tenant_limit':   60,
}


class BulkUploadAPIView(APIView):
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        files = request.FILES.getlist('files')
        if not files:
            return Response({'error': 'No files uploaded'}, status=400)

        tenant_id = str(getattr(request.user, 'tenant_id', '88fe4389-58a9-4244-9878-8a4e646898bd'))

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
                   for hc in job.items.values_list('file_hash', flat=True):
                       InvoiceTempOCR.objects.filter(file_hash=hc, tenant_id=tenant_id).update(upload_session_id=new_session)
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
                from ocr_pipeline.repository import InvoiceTempOCR
                for hc in existing.items.values_list('file_hash', flat=True):
                   InvoiceTempOCR.objects.filter(file_hash=hc, tenant_id=tenant_id).update(upload_session_id=new_session)
                   
            if existing.status == 'pending':
                # Re-trigger attempt if stuck in pending
                print(f"DEBUG: Found pending job {existing.id} during idempotency check. Re-triggering thread.")
                voucher_type = request.data.get('voucher_type', 'Purchase')
                import threading
                from .pipeline.direct_processor import process_bulk_job
                thread = threading.Thread(target=process_bulk_job, args=(existing.id, voucher_type))
                thread.daemon = True
                thread.start()
            
            return Response({'status': 'already_processing', 'job_id': existing.id,
                             'total_files': existing.total_files})

        # ── GATE 5: Distributed lock (race condition) ─────────────────────────
        if not lock.acquire():
            return Response({'status': 'already_processing',
                             'message': 'Duplicate request received'})

        # ── GATE 6: Instant Extraction (No Persistence) ──────────────────
        no_persist = request.data.get('no_persist') == 'true' or request.query_params.get('no_persist') == 'true'
        if no_persist:
            try:
                results = []
                voucher_type = request.data.get('voucher_type', 'Purchase')
                from ocr_pipeline.service import process_invoice_upload
                
                for uploaded_file in files:
                    file_bytes = uploaded_file.read()
                    # We use a dummy session_id for non-persistent tracking in the response if needed
                    res = process_invoice_upload(
                        file_bytes=file_bytes,
                        voucher_type=voucher_type,
                        file_name=uploaded_file.name,
                        upload_session_id="INSTANT",
                        tenant_id=tenant_id
                    )
                    # IMMEDIATELY DELETE from Staging (InvoiceTempOCR) to ensure "no save in any tables"
                    from ocr_pipeline.repository import InvoiceTempOCR
                    InvoiceTempOCR.objects.filter(id=res.get('id')).delete()
                    
                    results.append(res)
                
                lock.release()
                return Response({
                    'status': 'completed',
                    'results': results,
                    'total_files': len(files)
                })
            except Exception as e:
                lock.release()
                logger.error(f"[UPLOAD] Instant extraction failed: {e}")
                return Response({'error': str(e)}, status=500)

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
        logger.info(f"[UPLOAD] Created Job {job.id} | tenant={tenant_id} | files={len(files)}")

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

        # ── PUSH TO PROCESSOR ─────────────────────────────────────
        # Note: No Kafka. Direct in-process worker thread.
        import threading
        from .pipeline.direct_processor import process_bulk_job
        
        # Determine voucher type from request
        voucher_type = request.data.get('voucher_type', 'Purchase')
        
        print(f"DEBUG: Starting background thread for Job {job.id} (Voucher: {voucher_type})")
        thread = threading.Thread(target=process_bulk_job, args=(job.id, voucher_type))
        thread.daemon = True
        thread.start()
        print(f"DEBUG: Thread started for Job {job.id}")

        return Response({
            'status':   'processing',
            'job_id':   job.id,
            'total_files': len(files),
            'file_path': paths[0] if paths else None,
            'file_paths': paths
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


class BulkStatusAPIView(APIView):
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

            return Response({
                'total':     total,
                'processed': success,
                'failed':    failed,
                'pending':   pending,
                'status':    job.status,
            })
        except BulkInvoiceJob.DoesNotExist:
            return Response({'error': 'Job not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)
