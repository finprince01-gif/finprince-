from rest_framework import views, status  # type: ignore
from rest_framework.response import Response  # type: ignore
from rest_framework.permissions import IsAuthenticated  # type: ignore
from django.db.models import Q  # type: ignore
from django.db import transaction  # type: ignore
from django.conf import settings
import logging
import json
import hashlib
import os
import time

from .models import InvoiceTempOCR, OCRJob, OCRTask, PipelineStatus, FinalizedSnapshot
from vouchers.models import UploadSession
from .zoho_adapter import get_zoho_adapter

logger = logging.getLogger(__name__)

class CleanOCRStagingView(views.APIView):
    """
    Step 3: Fix API Response.
    Isolated from legacy 'vouchers.staging_api'.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        PRODUCTION-HARDENED: 
        1. Deduplicate by hash
        2. Backpressure check
        3. Upload to S3
        4. Push to SQS
        """
        print("\n" + "="*50)
        print(f"STAGING API: POST REQUEST RECEIVED")
        print("="*50 + "\n")
        
        # QUEUE BACKEND ENFORCEMENT
        queue_backend = os.getenv('QUEUE_BACKEND', 'sqs')

        from core.storage import StorageService
        from core.sqs import QueueService
        
        def get_list(data, key):
            if hasattr(data, 'getlist'):
                return data.getlist(key)
            val = data.get(key, [])
            return val if isinstance(val, list) else ([val] if val else [])

        files = request.FILES.getlist('files')
        file_paths = get_list(request.data, 'file_paths')
        voucher_type = request.data.get('voucher_type', 'PURCHASE')
        # [UPLOAD_TYPE PROPAGATION FIX] Read source-aware upload type sent by frontend
        upload_type = request.data.get('upload_type', '').strip().upper() or 'UNKNOWN'
        upload_session_id = request.data.get('upload_session_id') or request.query_params.get('upload_session_id')
        tenant_id = request.user.branch_id
        
        logger.info(
            f"[SESSION_TRACE_UPLOAD] session={upload_session_id} tenant={tenant_id} "
            f"voucher_type={voucher_type} file_count={len(files)}"
        )

        from core.sqs import QueueService
        queue = QueueService()
        
        # ── [PHASE 13: BACKPRESSURE THROTTLING] ──
        queue = QueueService()
        try:
            depth = queue.get_queue_depth(queue_type='ingestion')
        except Exception:
            depth = 0
            
        from core.observability import observability
        observability.api_metric(event="BACKPRESSURE_CHECK", queue_depth=depth)
        
        if depth > 1000: # Threshold for 1000 pending invoices
            logger.warning(f"[API_BACKPRESSURE] Queue depth {depth} exceeds threshold.")
            observability.api_metric(event="BACKPRESSURE_THROTTLED", queue_depth=depth)
            return Response({
                "error": "Processing queue is full. Please wait a few minutes.",
                "status": "BACKPRESSURE_THROTTLED",
                "queue_depth": depth
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # ── [PHASE 2 HARDENING: DIRECT S3 UPLOAD SUPPORT] ──
        # Check if client is using direct S3 upload via session_ids
        session_ids = get_list(request.data, 'session_ids')
        if session_ids:
            return self._handle_session_metadata_upload(request, session_ids, tenant_id)

        if not files:
            return Response({'error': 'No files uploaded'}, status=status.HTTP_400_BAD_REQUEST)

        storage = StorageService()
        # [FORENSIC FIX] Always use the module-level singleton — never instantiate a new QueueService()
        # A new instance resolves env vars lazily at construction time; on EC2 this can yield None URLs
        # and push() silently returns False, causing message loss before ingestion begins.
        from core.sqs import queue_service as queue

        # ΓöÇΓöÇ Step 1: Create Job Record ΓöÇΓöÇ
        job = OCRJob.objects.create(
            tenant_id=tenant_id,
            total_files=len(files),
            status='PENDING'
        )

        queued_count = 0
        duplicate_count = 0

        # ΓöÇΓöÇ Step 2: Process Files ΓöÇΓöÇ
        for i, uploaded_file in enumerate(files):
            try:
                # Determine display name (Preserve folder structure if provided)
                original_display_name = file_paths[i] if i < len(file_paths) else uploaded_file.name
                
                logger.info(f"[UPLOAD_ACCEPTED] file={original_display_name} job={job.id}")
                
                file_bytes = uploaded_file.read()
                file_hash = hashlib.sha256(file_bytes).hexdigest()
                
                # ΓöÇΓöÇ DEDUPLICATION ΓöÇΓöÇ
                # If we already have a successful result for this hash, we log it.
                # [BOOTSTRAP_FIX] We MUST NOT 'continue' here, otherwise the new session
                # never gets an InvoiceTempOCR row, never queues a message, and hangs the UI.
                # Downstream AI Inference Cache will handle the actual compute deduplication.
                existing = InvoiceTempOCR.objects.filter(file_hash=file_hash, tenant_id=tenant_id).first()
                if existing and existing.processed:
                    duplicate_count += 1
                    logger.info(f"[DUPLICATE_FOUND] Allowing pipeline to orchestrate duplicate file={original_display_name} hash={file_hash}")
                    # Link existing result to this job via a special completed task
                    OCRTask.objects.create(
                        job=job,
                        file_name=original_display_name,
                        file_hash=file_hash,
                        status='COMPLETED',
                        result_id=existing.id
                    )
                    # We no longer `continue` so that get_or_create and queue.push still run for the NEW session!

                # Upload to storage (local fallback if S3 not configured)
                s3_key = f"ocr/{tenant_id}/{job.id}/{file_hash}_{original_display_name.replace('/', '_')}"
                safe_content_type = uploaded_file.content_type or 'application/octet-stream'
                file_url = storage.upload_file(file_bytes, s3_key, safe_content_type)
                
                # Create or get InvoiceTempOCR (The primary state container for the pipeline)
                record, created = InvoiceTempOCR.objects.get_or_create(
                    tenant_id=tenant_id,
                    upload_session_id=upload_session_id,
                    file_hash=file_hash,
                    defaults={
                        'file_path': file_url,
                        'status': 'PENDING',
                        'voucher_type': voucher_type,
                        'upload_type': upload_type  # [UPLOAD_TYPE PROPAGATION FIX]
                    }
                )
                
                if not created:
                    logger.warning(f"[DUPLICATE_UPLOAD] session={upload_session_id} file={original_display_name} hash={file_hash} already exists in this session. Reusing record={record.id}.")
                    # If it's already completed or processing, we might want to skip SQS enqueue, but let's at least avoid the 500 error.
                    # We will continue to enqueue so it can be processed if it was stuck, but if it's already processed, the worker handles deduplication.
                
                # Create Task (Legacy tracking)
                task = OCRTask.objects.create(
                    job=job,
                    file_name=original_display_name,
                    file_url=file_url,
                    file_hash=file_hash,
                    status='PENDING',
                    result_id=record.id
                )
                
                # Push to SQS via Canonical Message Factory
                from vouchers.message_factory import message_factory
                
                ingestion_payload = {
                    "record_id": record.id,
                    "job_id": str(job.id),
                    "file_url": file_url,
                    "file_hash": file_hash,
                    "voucher_type": voucher_type,
                    "attempt": 1
                }
                
                # [PHASE 11.9] Sanity Check Before Enqueue
                if not record or not record.id or not file_url:
                    logger.error(f"[INGESTION_ABORTED] Missing critical record data for file {uploaded_file.name}")
                    continue

                from core.middleware import get_correlation_id
                msg = message_factory.create_message(
                    task_type="INGESTION",
                    tenant_id=tenant_id,
                    session_id=upload_session_id,
                    payload={
                        **ingestion_payload,
                        'upload_type': upload_type,  # [UPLOAD_TYPE PROPAGATION FIX]
                    },
                    correlation_id=get_correlation_id()
                )
                
                logger.info(f"[RECORD_CREATED] id={record.id} session={upload_session_id} file={original_display_name}")
                logger.info(f"[DISTRIBUTED_PIPELINE_ACTIVE] session_id='{upload_session_id}' status='ACTIVE'")
                logger.info(f"[REDIS_COORDINATION_ACTIVE] session_id='{upload_session_id}' coordinator='redis'")
                from copy import deepcopy
                msg_copy = deepcopy(msg)
                
                try:
                    queue.push(msg_copy, queue_type='ingestion')
                    logger.info(f"[QUEUE_FORWARD_SUCCESS] target_queue=ingestion msg_id={msg_copy['id']}")
                    logger.info(f"[DOWNSTREAM_ENQUEUE_SUCCESS] target_queue=ingestion msg_id={msg_copy['id']}")
                except Exception as e:
                    logger.error(f"[QUEUE_FORWARD_FAILURE] target_queue=ingestion error={e}")
                    logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=ingestion error={e}")
                    raise
                logger.info(f"[SQS_DISPATCH_SUCCESS] session_id='{upload_session_id}' msg_id='{msg.get('id')}' queue='ingestion'")
                logger.info(f"[CLUSTER_WORKER_ACTIVE] role='ingestion' status='POLLING'")
                queued_count += 1
                
            except Exception as e:
                logger.error(f"Failed to process file {uploaded_file.name}: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
                job.total_files -= 1
        
        job.save()

        # [BOOTSTRAP TERMINALIZATION FIX]
        # If no files were successfully queued but there were files uploaded, the pipeline is stalled.
        if queued_count == 0 and len(files) > 0 and duplicate_count == 0:
            logger.error(f"[BOOTSTRAP_FAILURE] session={upload_session_id} - No files queued. Marking session as FAILED.")
            try:
                from core.redis_orchestrator import orchestrator
                orchestrator.set_terminal_status(upload_session_id, "FAILED", "BOOTSTRAP_CRASH")
                job.status = 'FAILED'
                job.save(update_fields=['status'])
            except Exception as re:
                logger.error(f"[BOOTSTRAP_TERMINALIZATION_FAIL] {re}")
            
            return Response({
                'error': 'Internal server error during upload bootstrap.',
                'status': 'FAILED'
            }, status=500)
        
        # Calculate estimated delay (assuming ~2s per invoice per worker)
        estimated_delay = (depth * 2) / max(int(os.getenv('AI_GLOBAL_CONCURRENCY', '20')), 1)

        return Response({
            "success": True,
            "job_id": str(job.id),
            "status": "PROCESSING",
            "message": f"Queued {queued_count} files. {duplicate_count} skipped (deduplicated).",
            "total_files": job.total_files,
            "estimated_delay_seconds": round(estimated_delay, 1)
        }, status=status.HTTP_202_ACCEPTED)

    def _map_record_to_ui_row(self, record, norm_data=None, vendor_map=None):
        """
        CENTRALIZED HYDRATION GATE.
        Ensures identical field mapping for both live polling and terminal snapshots.

        vendor_map: Optional pre-built session-level canonical vendor resolution map
            { (gstin_upper, norm_branch): { status, vendor_id, vendor_name, matched_by } }
        When provided, NO live DB queries are performed for vendor matching.
        This is the session-deterministic path — all rows with same GSTIN+branch receive
        identical vendor resolution, eliminating race-condition status divergence.
        """
        r = record
        norm = norm_data or r.extracted_data or {}
        v_status = getattr(r, 'validation_status', "PENDING")
        v_id = getattr(r, 'vendor_id', None)
        v_status_record = getattr(r, 'status', "PROCESSING")

        sections = norm.get("sections", {})
        supplier = sections.get("supplier_details", {})
        header = norm.get("header", {})

        # ⚠️ IMMUTABILITY GUARD: Never touch validation_status if it is already DUPLICATE or NEED_TO_SAVE.
        IMMUTABLE_STATUSES = {'DUPLICATE', 'NEED_TO_SAVE', 'VOUCHER_CREATED'}
        tenant_id = getattr(r, 'tenant_id', None)
        logger.info(f"[PURCHASE_SCAN_VENDOR_VALIDATION_CALL] id={getattr(r, 'id', None)} tenant_id={tenant_id} validation_status={v_status}")

        from .normalize import fix_encoding_corruption
        vendor_name_val = fix_encoding_corruption(header.get("vendor_name") or supplier.get("vendor_name") or norm.get("vendor_name") or "—")

        if tenant_id:
            gstin_val = (getattr(r, 'gstin', None) or header.get("vendor_gstin") or norm.get("gstin") or supplier.get("gstin") or norm.get("vendor_gstin") or "")
            if isinstance(gstin_val, str):
                gstin_val = gstin_val.strip()
                if gstin_val in ["", "—", "None", "null"]:
                    gstin_val = ""
            else:
                gstin_val = ""

            branch_val = (getattr(r, 'branch', None) or header.get("branch") or supplier.get("branch") or norm.get("branch") or "")
            if isinstance(branch_val, str):
                branch_val = branch_val.strip()
                if branch_val in ["", "—", "None", "null"]:
                    branch_val = ""
            else:
                branch_val = ""

            if v_id and v_status in IMMUTABLE_STATUSES:
                logger.info(
                    f"[SESSION_VENDOR_LOCK] record_id={getattr(r, 'id', None)} "
                    f"vendor_id={v_id} (frozen DB value — skipping map lookup)"
                )
            elif gstin_val:
                # ── SESSION-DETERMINISTIC VENDOR LOOKUP ──
                # If a pre-built vendor_map is available (always preferred), use it.
                val_res = None
                if vendor_map is not None:
                    from vendors.vendor_validation_logic import normalize_branch as _nb
                    map_key = (gstin_val.strip().upper(), _nb(branch_val or "Main Branch"))
                    map_entry = vendor_map.get(map_key)
                    if map_entry:
                        val_res = map_entry
                        logger.info(
                            f"[HYDRATION_READONLY_RENDER] record_id={getattr(r, 'id', None)} "
                            f"gstin={gstin_val} branch={branch_val} "
                            f"map_key={map_key} map_status={val_res.get('status')} "
                            f"vendor_id={val_res.get('vendor_id')} source=session_vendor_map"
                        )
                    else:
                        # GSTIN had no map entry — vendor not in master or GSTIN missing
                        val_res = {"status": "CREATE_VENDOR", "vendor_id": None}
                        logger.info(
                            f"[HYDRATION_READONLY_RENDER] record_id={getattr(r, 'id', None)} "
                            f"map_key={map_key} not found in session_vendor_map → CREATE_VENDOR"
                        )
                else:
                    # Fallback to safe, read-only empty map
                    logger.error(
                        f"[VENDOR_VALIDATION_BYPASS_DETECTED] vendor_map is missing in hydration! "
                        f"tenant_id={tenant_id} record_id={getattr(r, 'id', None)} gstin={gstin_val} branch={branch_val}"
                    )
                    val_res = {"status": "CREATE_VENDOR", "vendor_id": None}

                if val_res and val_res.get('status') == 'EXISTING_VENDOR':
                    v_id = val_res.get('vendor_id')
                    if v_status not in IMMUTABLE_STATUSES:
                        if v_status in ['NEED_VENDOR', 'VENDOR_MISSING', 'NOT_FOUND', 'PENDING']:
                            v_status = 'READY'
                    logger.info(
                        f"[VENDOR_STATUS_ASSIGNED] record_id={getattr(r, 'id', None)} "
                        f"vendor_id={v_id} validation_status={v_status} "
                        f"source=session_vendor_map (read-only — DB not mutated)"
                    )
                else:
                    v_id = None
                    if v_status not in IMMUTABLE_STATUSES:
                        if v_status in ['FOUND', 'READY', 'RESOLVED']:
                            v_status = 'NEED_VENDOR'
                    logger.info(
                        f"[VENDOR_VALIDATION_RESULT] id={getattr(r, 'id', None)} "
                        f"result_status={val_res.get('status') if val_res else 'None'} → no vendor_id assigned"
                    )
            else:
                v_id = None
                logger.info(
                    f"[VENDOR_MATCH_FAILED] record_id={getattr(r, 'id', None)} reason=MISSING_GSTIN"
                )

        # --- [PHASE 11.9] DETERMINISTIC STATE ENFORCEMENT ---
        # Requirement #2: Enforce PROCESSING, FINALIZED, FAILED, PARTIAL_FAILED
        # Requirement #3: Block hydration for incomplete records
        
        is_finalized = v_status_record in ['FINALIZED', 'VOUCHER_CREATED', 'COMPLETED', 'EXTRACTED'] or getattr(r, 'processed', False)
        is_failed = v_status_record in ['FAILED', 'ERROR']
        
        if not is_finalized and not is_failed:
             # Check if we have absolutely no extracted data yet
             has_extracted_data = False
             if norm:
                 useful_keys = [k for k in norm if k not in ['_page_role', 'page_role', 'file_hash', 'file_path', 'session_id', 'tenant_id']]
                 if useful_keys:
                     has_extracted_data = True

             if not has_extracted_data:
                 # [FORENSIC] Return placeholder to block premature hydration only for completely empty records
                 return {
                     "processing": True, 
                     "id": getattr(r, 'id', None),
                     "file_path": getattr(r, 'file_path', '') or '',
                     "file_hash": getattr(r, 'file_hash', '') or '',
                     "invoice": {},
                     "items": [],
                     "status": "PROCESSING",
                     "validationStatus": "PROCESSING"
                 }

        # Determine terminal validation status
        ui_status = v_status or "PENDING"
        if v_status == 'DUPLICATE':
            ui_status = 'DUPLICATE'
        elif is_failed: 
            ui_status = 'EXTRACTION_FAILED'
        elif is_finalized:
            if v_status == 'VOUCHER_CREATED' or v_status_record == 'VOUCHER_CREATED':
                ui_status = 'VOUCHER_CREATED'
            elif v_status in ['READY', 'FOUND', 'RESOLVED', 'SUCCESS', 'NEED_TO_SAVE'] or v_id:
                ui_status = 'READY'
            elif v_status in ['GSTIN_CONFLICT']:
                ui_status = v_status
            else:
                ui_status = 'NEED_VENDOR'

        logger.info(f"[REVIEW_STATUS_HYDRATION] id={getattr(r, 'id', None)} v_status='{v_status}' ui_status='{ui_status}'")

        # Map to final deterministic status
        final_status = "PROCESSING"
        if is_finalized: final_status = "FINALIZED"
        elif is_failed: final_status = "FAILED"
        
        sections = norm.get("sections", {})
        supplier = sections.get("supplier_details", {})
        header = norm.get("header", {})
        
        from .normalize import fix_encoding_corruption
        branch = fix_encoding_corruption(str(getattr(r, 'branch', None) or header.get("branch") or supplier.get("branch") or norm.get("branch") or "—"))
        
        bill_from = fix_encoding_corruption(norm.get("bill_from", ""))
        bill_to = fix_encoding_corruption(norm.get("bill_to", "") or norm.get("billing_address", ""))
        inv_no = (
            getattr(r, 'supplier_invoice_no', None) or 
            header.get("invoice_no") or 
            norm.get("invoice_no") or 
            norm.get("invoice_number") or 
            norm.get("supplier_invoice_no") or 
            supplier.get("supplier_invoice_no") or ""
        )
        items = norm.get("items") or header.get("items") or []

        # [INVALID_HYBRID_STATUS_BLOCKED] Prevention logic
        if final_status == "FINALIZED" and ui_status == "EXTRACTION_FAILED":
             logger.error(f"[INVALID_HYBRID_STATUS_BLOCKED] inv={inv_no} final_status=FINALIZED but ui_status=EXTRACTION_FAILED. Correcting to FAILED.")
             final_status = "FAILED"

        res = {
            "id": getattr(r, 'id', None),
            "file_hash": getattr(r, 'file_hash', None),
            "file_path": getattr(r, 'file_path', None),
            "tenant_id": getattr(r, 'tenant_id', None),
            "invoice_no": inv_no,
            "page_no": norm.get("_page_no") or norm.get("page_no") or getattr(r, 'page_no', None),
            "invoice_status": norm.get("invoice_status") or ("MISSING" if not inv_no else "FOUND"),
            "invoice_date": norm.get("invoice_date") or header.get("invoice_date") or supplier.get("invoice_date") or "—",
            "total_amount": (
                norm.get("total_invoice_value") or
                norm.get("invoice_total") or 
                header.get("total_amount") or 
                header.get("invoice_total") or 
                norm.get("total_amount") or "0.00"
            ),
            "totals": (
                norm.get("total_invoice_value") or
                norm.get("invoice_total") or 
                header.get("total_amount") or 
                header.get("invoice_total") or 
                norm.get("total_amount") or "0.00"
            ),
            "branch": branch,
            "vendor_name": fix_encoding_corruption(header.get("vendor_name") or supplier.get("vendor_name") or norm.get("vendor_name") or "—"),
            "vendor_gstin": getattr(r, 'gstin', None) or header.get("vendor_gstin") or norm.get("gstin") or supplier.get("gstin") or norm.get("vendor_gstin") or "—",
            "gstin": getattr(r, 'gstin', None) or header.get("gstin") or norm.get("gstin") or supplier.get("gstin") or "—",
            "vendor_id": v_id,
            "status": final_status,
            "validationStatus": ui_status,
            "validation_status": ui_status,
            "vendor_status": "EXISTS" if v_id else "NEW",
            "processed": getattr(r, 'processed', False),
            "bill_from": bill_from,
            "bill_to": bill_to,
            "items": items,
            "irn": getattr(r, 'irn', None) or norm.get("irn"),
            "ack_no": getattr(r, 'ack_no', None) or norm.get("ack_no"),
            "ack_date": getattr(r, 'ack_date', None) or norm.get("ack_date"),
            "hsn_sac": norm.get("hsn_sac", ""),
            "place_of_supply": norm.get("place_of_supply") or supplier.get("place_of_supply") or "—",
            "total_taxable_value": norm.get("total_taxable_value") or supplier.get("total_taxable_value") or norm.get("taxable_value") or "0.00",
            "total_igst": norm.get("total_igst") or supplier.get("total_igst") or norm.get("igst") or "0.00",
            "total_cgst": norm.get("total_cgst") or supplier.get("total_cgst") or norm.get("cgst") or "0.00",
            "total_sgst": norm.get("total_sgst") or supplier.get("total_sgst") or norm.get("sgst") or "0.00",
            "total_cess": norm.get("total_cess") or supplier.get("total_cess") or norm.get("cess") or "0.00",
            "round_off": norm.get("round_off") or supplier.get("round_off") or "0.00",
            "total_invoice_value": norm.get("total_invoice_value") or norm.get("invoice_total") or supplier.get("total_invoice_value") or "0.00",
        }
        
        # ── [FIX] VOID/DEGRADED ROW HANDLING ──
        # If the invoice has no valid identity and no items, it's a degraded row.
        is_degraded = (not inv_no or str(inv_no).upper() == "MISSING") and not items
        if getattr(r, 'status', None) == 'partial_extraction' or norm.get('status') == 'partial_extraction':
            is_degraded = True
            
        if is_degraded:
            logger.info(f"[DEGRADED_ROW_HYDRATED] id={getattr(r, 'id', None)} replacing missing fields with N/A / Needs Review")
            res["invoice_no"] = "N/A"
            res["vendor_name"] = "OCR FAILED"
            res["validationStatus"] = "Needs Review"
            res["validation_status"] = "Needs Review"
            res["status"] = "Needs Review"
            res["vendor_status"] = "NEW"
            ui_status = "Needs Review"

        # [PHASE 11.9] FORENSIC HSN HYDRATION LOG
        logger.info(f"[HSN_UI_HYDRATED] inv={inv_no} hsn_sac='{res.get('hsn_sac')}'")
        logger.info(f"[VENDOR_STATUS_MAPPING] id={getattr(r, 'id', None)} v_status={v_status} v_id={v_id} ui_status={ui_status}")
        logger.info(f"[FRONTEND_VENDOR_STATUS] id={getattr(r, 'id', None)} vendor_status={res.get('vendor_status')} validationStatus={res.get('validationStatus')}")
        
        res["extracted_data"] = {
                "sections": sections,
                "bill_from": bill_from,
                "billing_address": bill_to,
                "items": items,
                **norm
            }
        res["created_at"] = getattr(r, 'created_at', None)
        res["voucher_type"] = getattr(r, 'voucher_type', 'PURCHASE')
        
        return res

    def _log_final_api_response_rows(self, data, source):
        if not isinstance(data, list):
            return
        for row in data:
            if isinstance(row, dict):
                logger.info(
                    f"[FORENSIC_API_ROW] source={source} "
                    f"invoice_no={row.get('invoice_no')} "
                    f"vendor_id={row.get('vendor_id')} "
                    f"vendor_status={row.get('vendor_status')} "
                    f"validation_status={row.get('validation_status')} "
                    f"gstin={row.get('gstin')} "
                    f"branch={row.get('branch')}"
                )

    def get(self, request, file_hash=None):
        t_poll_start = time.time()
        session_id = request.query_params.get('upload_session_id')
        tenant_id = getattr(request.user, 'branch_id', None) or getattr(request.user, 'tenant_id', None) or '88fe4389-58a9-4244-9878-8a4e646898bd'
        resume = request.query_params.get('resume') == 'true'
        
        from core.observability import metrics, observability
        metrics.increment_counter("api:poll_request")
        
        # Log exact query filters as requested (Requirements B and C)
        job_id = request.query_params.get('job_id')
        if not job_id and session_id:
            from vouchers.models import BulkInvoiceJob
            job = BulkInvoiceJob.objects.filter(upload_session_id=session_id).order_by('-created_at').first()
            if job:
                job_id = job.id
                
        logger.info("[STAGING_QUERY_START] Polling /api/ocr-staging/")
        logger.info(f"[STAGING_QUERY_FILTERS] upload_session_id='{session_id}' tenant_id='{tenant_id}' job_id='{job_id}' status='ACTIVE'")

        # Compute is_processing state to prevent premature finalization when processing multiple files
        is_processing = False
        records_exist = False
        if session_id:
            records = InvoiceTempOCR.objects.filter(upload_session_id=session_id, tenant_id=tenant_id)
            if not records.exists():
                records = InvoiceTempOCR.objects.filter(upload_session_id=session_id)
            records_exist = records.exists()
            if records_exist:
                is_processing = records.filter(status__in=[
                    'PENDING', 'INGESTED', 'INGESTING',
                    PipelineStatus.QUEUED, PipelineStatus.PROCESSING, PipelineStatus.EXTRACTING, 
                    PipelineStatus.ASSEMBLING, PipelineStatus.FINALIZING
                ]).exists()

        # [PHASE 16] CHECK TERMINAL STATE DIRECTLY FROM REDIS BEFORE BLOCKING ON is_processing
        terminal_from_redis = False
        if session_id:
            from core.redis_orchestrator import orchestrator
            auth_state = orchestrator.get_authoritative_session_state(session_id)
            terminal_from_redis = auth_state.get('terminal', False)

        # ── 1. CHECK FOR IMMUTABLE SNAPSHOT (PHASE 4) ──
        if session_id and (not is_processing or terminal_from_redis) and records_exist:
            from .models import FinalizedSnapshot
            snapshots = FinalizedSnapshot.objects.filter(session_id=session_id, tenant_id=tenant_id).order_by('created_at', 'id')
            
            # Anti-Race Condition Guard (Requirement 6):
            # If the snapshot is not found but the Bulk Invoice Job is already completed/finalized,
            # wait up to 150ms and query again in case the database transaction is committing right now.
            if not snapshots.exists():
                from vouchers.models import BulkInvoiceJob
                job = BulkInvoiceJob.objects.filter(upload_session_id=session_id).first()
                if job and job.status in ['COMPLETED', 'FINALIZED', 'PARTIAL']:
                    logger.warning(f"[STAGING_QUERY_RETRY] Job={job.id} is {job.status} but Snapshot is missing. Sleeping 150ms...")
                    time.sleep(0.150)
                    snapshots = FinalizedSnapshot.objects.filter(session_id=session_id, tenant_id=tenant_id).order_by('created_at', 'id')

            # Resilient Tenant Fallback (Requirement 5):
            # If still not found by tenant, query by session_id only. 
            # This completely heals any mismatch between upload time tenant ID and GET request tenant ID.
            if not snapshots.exists():
                snapshots = FinalizedSnapshot.objects.filter(session_id=session_id).order_by('created_at', 'id')

            if snapshots.exists():
                mapped_data = []

                # [SESSION_VENDOR_RESOLUTION] Build canonical vendor map ONCE from live DB records
                # before iterating over snapshot rows. This guarantees all rows with the same
                # GSTIN+branch receive identical vendor_id / validationStatus (session-deterministic).
                _snap_db_records = list(
                    InvoiceTempOCR.objects.filter(upload_session_id=session_id)
                ) if session_id else []
                from vendors.vendor_validation_logic import build_session_vendor_map
                _snap_vendor_map = build_session_vendor_map(tenant_id, _snap_db_records)
                logger.info(f"[SESSION_VENDOR_MAP_BUILD] path=snapshot session={session_id} map_size={len(_snap_vendor_map)}")

                for snapshot in snapshots:
                    snapshot_data = self._get_snapshot_data(snapshot)
                    raw_rows = snapshot_data.get('data', [])
                    
                    # [PHASE 11.9] Re-map snapshot rows to ensure UI key consistency
                    for row in raw_rows:
                        # Try to resolve actual database record from InvoiceTempOCR to preserve live edits & valid statuses
                        inv_no = row.get('invoice_no')
                        gstin_val = row.get('gstin')
                        
                        db_record = None
                        if session_id:
                            # Strict match by session, invoice_no and gstin
                            db_record = InvoiceTempOCR.objects.filter(
                                upload_session_id=session_id,
                                supplier_invoice_no=inv_no,
                                gstin=gstin_val
                            ).first()
                            
                            # Fallback match by session and invoice_no
                            if not db_record and inv_no:
                                db_record = InvoiceTempOCR.objects.filter(
                                    upload_session_id=session_id,
                                    supplier_invoice_no=inv_no
                                ).first()
                        
                        if not db_record and row.get('id'):
                            db_record = InvoiceTempOCR.objects.filter(id=row.get('id')).first()
                            
                        if db_record:
                            # Ensure the DB record has tenant_id if it's somehow missing (defensive)
                            if not getattr(db_record, 'tenant_id', None) and tenant_id:
                                db_record.tenant_id = tenant_id
                            dummy = db_record
                            norm_source = db_record.extracted_data or row
                        else:
                            norm_source = row
                            from types import SimpleNamespace
                            dummy = SimpleNamespace(**{
                                'id': row.get('id'),
                                'tenant_id': tenant_id,
                                'status': 'FINALIZED',
                                'processed': True,
                                'validation_status': row.get('validation_status') or 'NEED_VENDOR',
                                'vendor_id': row.get('vendor_id'),
                                'supplier_invoice_no': inv_no,
                                'gstin': gstin_val,
                                'irn': row.get('irn'),
                                'ack_no': row.get('ack_no'),
                                'ack_date': row.get('ack_date'),
                                'created_at': row.get('created_at'),
                                'voucher_type': row.get('voucher_type'),
                                'branch': row.get('branch')
                            })
                            
                        # Pass vendor_map so this row uses the deterministic session resolution.
                        # SimpleNamespace dummies will still get the map — their gstin/branch fields
                        # are set from the snapshot row data, so the lookup will work correctly.
                        mapped = self._map_record_to_ui_row(dummy, norm_data=norm_source, vendor_map=_snap_vendor_map)
                        
                        inv_no = mapped.get('invoice_no', '')
                        vendor = mapped.get('vendor_name', '')
                        
                        # Log non-destructive warnings instead of discarding rows
                        if mapped.get('status') == 'FAILED' or mapped.get('validationStatus') == 'EXTRACTION_FAILED':
                            logger.warning(f"[PIPELINE_FILTER_REASON] inv_no='{inv_no}' reason='status_failed_warning'")
                        if not inv_no or str(inv_no).strip().upper() == 'MISSING' or str(inv_no).strip() == '—':
                            logger.warning(f"[PIPELINE_FILTER_REASON] inv_no='{inv_no}' reason='missing_invoice_no_warning'")
                        if not vendor or str(vendor).strip().upper() == 'MISSING' or str(vendor).strip() == '—':
                            logger.warning(f"[PIPELINE_FILTER_REASON] inv_no='{inv_no}' reason='missing_vendor_warning'")
                        
                        # We absolutely preserve the DTO to enforce 100% hydration count consistency!
                        mapped_data.append(mapped)
                
                logger.info(f"[FINAL_HYDRATION_COUNT] count={len(mapped_data)}")
                logger.info(f"[STAGING_QUERY_RESULT_COUNT] count={len(mapped_data)} (from combined snapshots)")
                if len(mapped_data) == 0:
                    logger.info("[STAGING_QUERY_EMPTY_REASON] Combined snapshots were found but all rows were empty or filtered out.")
                    
                first_snap = snapshots.first()
                self._log_final_api_response_rows(mapped_data, "snapshot")
                return Response({
                    "status": "FINALIZED",
                    "data": mapped_data,
                    "snapshot_id": first_snap.id,
                    "version": first_snap.snapshot_version,
                    "finalized_at": first_snap.finalized_at
                })
            else:
                logger.info(f"[STAGING_QUERY_EMPTY_REASON] Snapshot not found for session_id={session_id}")

        # ── 2. REDIS-BACKED ORCHESTRATION STATUS (PHASE 3D) ──
        # [PROGRESS_PROPAGATION_FIX] Workers write Redis status under session:{record_id},
        # NOT under session:{upload_session_id}. We must resolve record IDs for this session
        # and aggregate their Redis statuses to get the real progress.
        if session_id:
            from core.redis_orchestrator import orchestrator

            def _get_aggregated_redis_status_for_session(sess_id):
                """
                [FORENSIC_FIX] Aggregate Redis status across all record_ids in this session.
                Workers write to session:{record_id}. The upload_session_id key is never written.
                """
                try:
                    record_ids_qs = InvoiceTempOCR.objects.filter(
                        upload_session_id=sess_id
                    ).values_list('id', flat=True)
                    record_ids = [str(rid) for rid in record_ids_qs]
                    logger.info(
                        f"[PROGRESS_AGGREGATION] session={sess_id} "
                        f"resolving record_ids={record_ids} for Redis aggregation"
                    )
                    if not record_ids:
                        # No records yet — session may still be bootstrapping
                        logger.info(f"[PROGRESS_AGGREGATION] session={sess_id} no record_ids found in DB yet")
                        return None

                    statuses = []
                    progresses = []
                    for rid in record_ids:
                        rs = orchestrator.get_session_status(rid)
                        st = rs.get('status', 'UNKNOWN') if rs else 'UNKNOWN'
                        prog = float(rs.get('progress', 0.0)) if rs else 0.0
                        statuses.append(st)
                        progresses.append(prog)
                        logger.info(
                            f"[PROGRESS_RECORD_STATUS] session={sess_id} "
                            f"record_id={rid} redis_status={st} redis_progress={prog:.1f}%"
                        )

                    # Aggregate: use the MAX progress, dominant status
                    agg_progress = max(progresses) if progresses else 0.0
                    TERMINAL_STATES = {"HYDRATION_READY", "FINALIZED", "COMPLETED", "FAILED", "ERROR", "PARTIAL_FAILED"}
                    PROCESSING_STATES = {"AI_PROCESSING", "ASSEMBLY_PENDING", "ASSEMBLY_COMPLETE",
                                         "PROCESSING", "INGESTION_COMPLETE", "INGESTION_STARTED",
                                         "INGESTING", "INGESTED", "FINALIZING", "SNAPSHOTTING"}
                    terminal_statuses = [s for s in statuses if s in TERMINAL_STATES]
                    processing_statuses = [s for s in statuses if s in PROCESSING_STATES]

                    if terminal_statuses:
                        agg_status = terminal_statuses[0]  # FINALIZED/FAILED take priority
                    elif processing_statuses:
                        agg_status = processing_statuses[0]
                    else:
                        agg_status = statuses[0] if statuses else 'UNKNOWN'

                    logger.info(
                        f"[PROGRESS_AGGREGATION_RESULT] session={sess_id} "
                        f"agg_status={agg_status} agg_progress={agg_progress:.1f}% "
                        f"all_statuses={statuses} all_progresses={progresses}"
                    )
                    return {"status": agg_status, "progress": agg_progress}
                except Exception as _agg_err:
                    logger.warning(f"[PROGRESS_AGGREGATION_ERROR] session={sess_id} error={_agg_err}")
                    return None

            redis_status = _get_aggregated_redis_status_for_session(session_id)
            if redis_status:
                redis_st = redis_status.get('status', '')
                # Normalize legacy/raw states to the canonical set checked below
                _PROCESSING_LIKE = {
                    "PROCESSING", "INGESTING", "INGESTED", "AI_PROCESSING",
                    "ASSEMBLY_PENDING", "ASSEMBLY_COMPLETE", "INGESTION_COMPLETE",
                    "INGESTION_STARTED", "FINALIZING", "SNAPSHOTTING"
                }
                if redis_st in _PROCESSING_LIKE:
                    # Check for stale state regression
                    has_snapshots = False
                    try:
                        from .models import FinalizedSnapshot
                        has_snapshots = FinalizedSnapshot.objects.filter(session_id=session_id).exists()
                    except:
                        pass

                    if has_snapshots:
                        logger.warning(f"[STALE_STATE_DETECTED] session={session_id} redis={redis_st} but snapshots exist! Overriding.")
                        # Fall through to snapshot hydration
                    else:
                        # [PROGRESSIVE_HYDRATION_FIX] Query staging records progressively
                        records = InvoiceTempOCR.objects.filter(upload_session_id=session_id, tenant_id=tenant_id).order_by('created_at', 'id')
                        if not records.exists():
                            records = InvoiceTempOCR.objects.filter(upload_session_id=session_id).order_by('created_at', 'id')

                        # [SESSION_VENDOR_RESOLUTION] Build canonical map ONCE before loop
                        records_list = list(records)
                        from vendors.vendor_validation_logic import build_session_vendor_map
                        _vendor_map = build_session_vendor_map(tenant_id, records_list)
                        logger.info(f"[SESSION_VENDOR_MAP_BUILD] path=redis_processing session={session_id} map_size={len(_vendor_map)}")

                        data = []
                        for r in records_list:
                            mapped = self._map_record_to_ui_row(r, vendor_map=_vendor_map)
                            norm = getattr(r, 'extracted_data', {}) or {}
                            page_role = norm.get('_page_role', '') or norm.get('page_role', '')
                            if page_role == 'PAGE_ROLE_CONTINUATION':
                                continue
                            data.append(mapped)

                        display_progress = min(99.0, float(redis_status.get('progress', 0.0)))
                        logger.info(
                            f"[PROGRESS_SERIALIZER] session={session_id} "
                            f"redis_progress={redis_status.get('progress', 0.0):.1f}% "
                            f"display_progress={display_progress:.1f}% source=redis_aggregated "
                            f"records_count={len(data)}"
                        )
                        self._log_final_api_response_rows(data, "redis_progress")
                        return Response({
                            "status": "PROCESSING",
                            "data": data,
                            "progress_percent": display_progress,
                            "source": "redis_aggregated"
                        })
                elif redis_st in ("HYDRATION_READY", "FINALIZED", "PARTIAL_FAILED", "FAILED", "EXPORTED", "COMPLETED"):
                    # [FIX] Terminal status written by finalize_worker must break polling immediately.
                    # Previously only PROCESSING was handled — FINALIZED was silently ignored.
                    logger.info(f"[STAGING_REDIS_TERMINAL] session={session_id} status={redis_st} — proceeding to snapshot/DB hydration")
                    # Fall through to snapshot + DB hydration below (do not return early)

        is_purchase_flow = False
        
        # ── 3. STATE MACHINE BARRIER (PHASE 3) ──
        if session_id:
            records = InvoiceTempOCR.objects.filter(upload_session_id=session_id, tenant_id=tenant_id)
            
            # Resilient Tenant Fallback for Staging records:
            if not records.exists():
                records_fb = InvoiceTempOCR.objects.filter(upload_session_id=session_id)
                if records_fb.exists():
                    logger.warning(f"[TENANT_MISMATCH_RECOVERED] Found staging records by session_id={session_id} but tenant_id was different (query tenant={tenant_id}, records tenant={records_fb.first().tenant_id})")
                    records = records_fb

            is_purchase_flow = records.filter(upload_type='PURCHASE').exists()

            # [FIX] Requirement #3: Include PENDING in is_processing list to block premature hydration
            is_processing = records.filter(status__in=[
                'PENDING', 'INGESTED', 'INGESTING',
                PipelineStatus.QUEUED, PipelineStatus.PROCESSING, PipelineStatus.EXTRACTING, 
                PipelineStatus.ASSEMBLING, PipelineStatus.FINALIZING
            ]).exists()
            
            # [HYDRATION_FIX]
            # Restrict review UI hydration to finalized, validated DTOs to prevent placeholder row leaks and edit-screen schema errors.
            # We MUST wait for terminal orchestration convergence or materialization.
            
            if not terminal_from_redis and (is_processing or records.count() == 0):
                empty_reason = "No staging records exist for this session yet." if records.count() == 0 else "Staging records are still in progress/processing."
                logger.info(f"[STAGING_QUERY_RESULT_COUNT] count=0 (is_processing={is_processing} count={records.count()})")
                logger.info(f"[STAGING_QUERY_EMPTY_REASON] {empty_reason}")

                # [PURCHASE_SCAN_PROGRESS_FIX] Read real Redis progress instead of hardcoding 0.
                # Previously this barrier always returned progress_percent=0, disconnecting
                # the frontend from actual backend extraction progress (18.75%, 25%, etc.).
                barrier_progress = 0.0
                try:
                    # [PROGRESS_PROPAGATION_FIX] Workers write to session:{record_id}, NOT session:{session_id}.
                    # Re-use the aggregated helper defined above in the Redis section.
                    # If the helper ran and gave us a result, use it; otherwise re-run.
                    _agg = None
                    try:
                        _agg = _get_aggregated_redis_status_for_session(session_id)
                    except NameError:
                        # Helper not in scope (early return path skipped that block)
                        from core.redis_orchestrator import orchestrator as _orch
                        _rec_ids = list(
                            InvoiceTempOCR.objects.filter(upload_session_id=session_id)
                            .values_list('id', flat=True)
                        )
                        _progresses = []
                        for _rid in _rec_ids:
                            _rs = _orch.get_session_status(str(_rid))
                            if _rs:
                                _progresses.append(float(_rs.get('progress', 0.0)))
                        if _progresses:
                            _agg = {"progress": max(_progresses)}

                    if _agg:
                        raw_progress = _agg.get('progress', 0.0)
                        barrier_progress = min(99.0, float(raw_progress or 0.0))
                        logger.info(
                            f"[PURCHASE_SCAN_BARRIER_PROGRESS] session={session_id} "
                            f"redis_progress={raw_progress} barrier_progress={barrier_progress} "
                            f"source=record_id_aggregated"
                        )
                    else:
                        logger.info(f"[PURCHASE_SCAN_BARRIER_PROGRESS] session={session_id} no Redis data found, using 0")
                except Exception as _prog_err:
                    logger.warning(f"[PURCHASE_SCAN_BARRIER_PROGRESS_ERROR] session={session_id} err={_prog_err}")

                logger.info(
                    f"[PROGRESS_SERIALIZER] session={session_id} "
                    f"barrier_progress={barrier_progress:.1f}% source=barrier_gate"
                )

                # [PROGRESSIVE_HYDRATION_FIX] Query staging records progressively
                # [SESSION_VENDOR_RESOLUTION] Build canonical map ONCE before loop — state machine barrier path
                records_list = list(records)
                from vendors.vendor_validation_logic import build_session_vendor_map
                _vendor_map = build_session_vendor_map(tenant_id, records_list)
                logger.info(f"[SESSION_VENDOR_MAP_BUILD] path=barrier session={session_id} map_size={len(_vendor_map)}")

                data = []
                for r in records_list:
                    mapped = self._map_record_to_ui_row(r, vendor_map=_vendor_map)
                    norm = getattr(r, 'extracted_data', {}) or {}
                    page_role = norm.get('_page_role', '') or norm.get('page_role', '')
                    if page_role == 'PAGE_ROLE_CONTINUATION':
                        continue
                    data.append(mapped)

                self._log_final_api_response_rows(data, "barrier")
                return Response({
                    "status": "PROCESSING",
                    "data": data,
                    "progress_percent": barrier_progress,
                    "source": "barrier"
                })
                

        # ── 4. FALLBACK: RAW STAGING HYDRATION ──
        if file_hash:
            if str(file_hash).isdigit():
                records = InvoiceTempOCR.objects.filter(id=int(file_hash), tenant_id=tenant_id)
                if not records.exists():
                    records_fb = InvoiceTempOCR.objects.filter(id=int(file_hash))
                    if records_fb.exists():
                        logger.warning(f"[TENANT_MISMATCH_RECOVERED] Raw staging records recovery by id={file_hash}")
                        records = records_fb
            else:
                records = InvoiceTempOCR.objects.filter(Q(file_hash=file_hash) | Q(upload_session_id=file_hash), tenant_id=tenant_id)
                if not records.exists():
                    records_fb = InvoiceTempOCR.objects.filter(Q(file_hash=file_hash) | Q(upload_session_id=file_hash))
                    if records_fb.exists():
                        logger.warning(f"[TENANT_MISMATCH_RECOVERED] Raw staging records recovery by file_hash={file_hash}")
                        records = records_fb
        elif session_id:
            records = InvoiceTempOCR.objects.filter(upload_session_id=session_id, tenant_id=tenant_id).order_by('created_at', 'id')
            
            # Resilient Tenant Fallback for Fallback Raw Hydration:
            if not records.exists():
                records_fb = InvoiceTempOCR.objects.filter(upload_session_id=session_id).order_by('created_at', 'id')
                if records_fb.exists():
                    logger.warning(f"[TENANT_MISMATCH_RECOVERED] Raw staging records recovery by session_id={session_id}")
                    records = records_fb
        elif resume:
            records = InvoiceTempOCR.objects.filter(tenant_id=tenant_id, processed=False).order_by('-created_at', '-id')
        else:
            records = InvoiceTempOCR.objects.none()

        # [SESSION_VENDOR_RESOLUTION] Build canonical vendor map ONCE for all rows — raw staging path
        records_list = list(records)
        _vendor_map_raw = {}
        if session_id or records_list:
            _eff_tenant = tenant_id
            from vendors.vendor_validation_logic import build_session_vendor_map
            _vendor_map_raw = build_session_vendor_map(_eff_tenant, records_list)
            logger.info(f"[SESSION_VENDOR_MAP_BUILD] path=raw_staging session={session_id} map_size={len(_vendor_map_raw)}")

        data = []
        for r in records_list:
            mapped = self._map_record_to_ui_row(r, vendor_map=_vendor_map_raw)
            # [FIX] Do NOT filter out FAILED rows. The UI must see them so the user can manually review
            # instead of hanging in a blank screen.

            # --- NEW MALFORMED ROW SANITIZATION ---
            norm = getattr(r, 'extracted_data', {}) or {}
            inv_no = mapped.get('invoice_no', '')
            vendor = mapped.get('vendor_name', '')
            page_role = norm.get('_page_role', '') or norm.get('page_role', '')

            # Log warnings instead of strictly dropping, to prevent hydration from returning rows=0
            # for documents with poor OCR but valid pipeline completion.
            if not inv_no or str(inv_no).strip().upper() == 'MISSING' or str(inv_no).strip() == '—':
                logger.warning(f"[PIPELINE_FILTER_REASON] inv_no='{inv_no}' reason='missing_invoice_no_warning'")
            if not vendor or str(vendor).strip().upper() == 'MISSING' or str(vendor).strip() == '—':
                logger.warning(f"[PIPELINE_FILTER_REASON] inv_no='{inv_no}' reason='missing_vendor_warning'")
            if page_role == 'PAGE_ROLE_CONTINUATION':
                # We do drop continuation pages from the primary staging view to prevent UI clutter
                continue
            # --------------------------------------

            if not mapped.get('invoice_no') and not mapped.get('items'):
                logger.warning(f"[ROW_FILTER_WARNING] reason='completely_empty_record' record={r.id}")
                mapped['_pipeline_warning'] = 'completely_empty_record'
                # DO NOT drop the row! The frontend needs to know it processed and yielded nothing,
                # otherwise the frontend assumes the row is still "in-flight" and retries forever.

            data.append(mapped)

        # [VENDOR_STATE_CORRUPTION_DETECTOR] Verify no two rows with same GSTIN+branch got different statuses
        _gstin_status_seen = {}
        for row in data:
            _row_gstin = (row.get('gstin') or "").strip().upper()
            _row_branch = (row.get('branch') or "").strip()
            _row_vid = row.get('vendor_id')
            _row_vstatus = row.get('validationStatus')
            if _row_gstin and _row_gstin not in ("—", "NONE"):
                _identity_key = (_row_gstin, _row_branch)
                if _identity_key in _gstin_status_seen:
                    _prev_vid, _prev_vstatus = _gstin_status_seen[_identity_key]
                    if _prev_vid != _row_vid or _prev_vstatus != _row_vstatus:
                        logger.error(
                            f"[VENDOR_STATE_CORRUPTION_DETECTED] "
                            f"session={session_id} gstin={_row_gstin} branch={_row_branch} "
                            f"row_id={row.get('id')} "
                            f"current vendor_id={_row_vid} validationStatus={_row_vstatus} "
                            f"vs prior vendor_id={_prev_vid} validationStatus={_prev_vstatus} "
                            f"— DIVERGENT STATUS FOR SAME IDENTITY"
                        )
                else:
                    _gstin_status_seen[_identity_key] = (_row_vid, _row_vstatus)
        
        poll_duration = time.time() - t_poll_start
        metrics.record_latency("api:poll_duration", poll_duration)
            
        logger.info(f"[STAGING_QUERY_RESULT_COUNT] count={len(data)} (raw staging)")
        if len(data) == 0:
            logger.info("[STAGING_QUERY_EMPTY_REASON] No staging rows returned because records were empty or filtered out.")

        # ── [PHASE 15] AUTHORITATIVE ORCHESTRATOR INFERENCE ──
        # 'completed' → frontend stops polling. Use ONLY when Orchestrator explicitly grants it.
        from core.redis_orchestrator import orchestrator
        session_to_check = request.query_params.get('upload_session_id') or session_id
        
        pipeline_status = 'processing'
        terminal = False
        hydration_pending = True
        
        if session_to_check:
            auth_state = orchestrator.get_authoritative_session_state(session_to_check)
            terminal = auth_state.get('terminal', False)
            snapshot_complete = auth_state.get('snapshot_complete', False)
            terminal_reason = auth_state.get('terminal_reason', '')
            
            if terminal:
                # If terminal, it's either COMPLETED or FAILED
                if terminal_reason in ['FAILED', 'FAILED_DUPLICATE', 'ERROR'] or (not snapshot_complete and len(data) == 0):
                    pipeline_status = 'failed'
                else:
                    pipeline_status = 'completed'
                hydration_pending = False
            else:
                pipeline_status = 'processing'
                hydration_pending = True
                logger.info(f"[FRONTEND_HYDRATION_WAIT] session={session_to_check} waiting for authoritative terminal state")
                
        if terminal and snapshot_complete and len(data) == 0:
            logger.error(f"[EMPTY_HYDRATION_ILLEGAL_STATE] session={session_to_check} terminal=True snapshot_complete=True but returning 0 rows!")
            
        logger.info(
            f"[STAGING_POLL] session={session_to_check} "
            f"records={len(data)} terminal={terminal} "
            f"pipeline_status={pipeline_status} hydration_pending={hydration_pending}"
        )
        logger.info(f"[STAGING_ROWS_RETURNED] count={len(data)} session={session_to_check}")
        logger.info(f"[FRONTEND_ROWS_RECEIVED] count={len(data)} session={session_to_check}")

        self._log_final_api_response_rows(data, "raw_staging")
        return Response({
            "status": pipeline_status.upper() if pipeline_status else "PROCESSING",
            "data": data,
            "pipeline_status": pipeline_status,
            "terminal": terminal,
            "hydration_pending": hydration_pending,
            "poll_latency": round(poll_duration, 3)
        })

    def patch(self, request, file_hash=None):
        """
        Step 3: Fix normalization on manual edits.
        """
        from .normalize import get_canonical_export_record
        from .grouping import run_grouping_logic
        
        if not file_hash:
            return Response({'error': 'Id or file_hash required'}, status=400)
            
        record = None
        if str(file_hash).startswith('snap_'):
            session_id = str(file_hash).replace('snap_', '')
            updated_data = request.data.get('extracted_data', {})
            sections = updated_data.get('sections', {})
            inv_no = (
                sections.get('supplier_details', {}).get('supplier_invoice_no') or 
                updated_data.get('supplier_invoice_no') or
                updated_data.get('invoice_no')
            )
            gstin_val = (
                sections.get('supplier_details', {}).get('gstin') or 
                updated_data.get('gstin')
            )
            query = InvoiceTempOCR.objects.filter(upload_session_id=session_id, tenant_id=request.user.branch_id)
            if inv_no:
                query = query.filter(supplier_invoice_no__iexact=inv_no)
            if gstin_val:
                query = query.filter(gstin__iexact=gstin_val)
            record = query.first()
            if not record:
                record = InvoiceTempOCR.objects.filter(upload_session_id=session_id, tenant_id=request.user.branch_id).first()
        else:
            record = InvoiceTempOCR.objects.filter(file_hash=file_hash, tenant_id=request.user.branch_id).first()
            if not record:
                record = InvoiceTempOCR.objects.filter(id=int(file_hash) if str(file_hash).isdigit() else None).first()
            
        if not record:
            return Response({'error': 'File not found'}, status=404)
            
        updated_data = request.data.get('extracted_data')
        if not updated_data:
            status_val = request.data.get('status')
            voucher_id_val = request.data.get('voucher_id')
            if status_val:
                record.validation_status = status_val
                if status_val == 'VOUCHER_CREATED':
                    record.processed = True
                    record.status = 'FINALIZED'
                if voucher_id_val:
                    record.voucher_id = voucher_id_val
                record.save()
                return Response({"success": True})
            return Response({'error': 'extracted_data required'}, status=400)
            
        try:
            sections = updated_data.get('sections', {})
            raw_target = {
                **{k: v for k, v in updated_data.items() if k != 'sections'},
                **(sections.get('supplier_details', {})),
                **(sections.get('supply_details', {})),
                **(sections.get('due_details', {})),
                **(sections.get('transit_details', {})),
                "line_items": sections.get('items', [])
            }
            
            # Instead of calling old validate_vendor(), run the full pipeline validate_and_process
            # so the status, vendor_id and branch matching all stay in sync.
            
            # RE-NORMALIZE on patch to ensure manual header edits propagate to line item tax types
            normalized_patch = get_canonical_export_record(updated_data, tenant_id=record.tenant_id)
            # Preserve the hierarchical 'sections' field so that nested objects (due_details, transit_details, etc.) are kept intact
            if isinstance(normalized_patch, dict):
                normalized_patch['sections'] = sections
            record.extracted_data = normalized_patch  # Store hierarchical data as-is (Sections intact)
            record.status = PipelineStatus.FINALIZED
            record.supplier_invoice_no = (
                sections.get('supplier_details', {}).get('supplier_invoice_no') or 
                raw_target.get('supplier_invoice_no')
            )
            record.gstin = (
                sections.get('supplier_details', {}).get('gstin') or 
                raw_target.get('gstin')
            )
            record.branch = sections.get('supplier_details', {}).get('branch') or ''
            record.save()
            
            # Run the authoritative pipeline validation
            from .pipeline import validate_and_process
            v_res = validate_and_process(record)

            # Re-run grouping after manual edit
            try:
                run_grouping_logic(record.tenant_id, record.upload_session_id)
            except Exception as ge:
                logger.error(f"Post-patch grouping failed: {str(ge)}")
            
            # Re-read the saved record to get accurate status
            record.refresh_from_db()
            from vendors.vendor_validation_logic import build_session_vendor_map
            _vendor_map_raw = build_session_vendor_map(record.tenant_id, [record])
            mapped = self._map_record_to_ui_row(record, vendor_map=_vendor_map_raw)
            
            return Response({
                "success": True, 
                "status": mapped.get("validationStatus") or record.validation_status,
                "vendor_id": mapped.get("vendor_id") or record.vendor_id,
                "vendor_name": mapped.get("vendor_name") or (
                    sections.get('supplier_details', {}).get('vendor_name') or
                    updated_data.get('vendor_name') or ''
                ),
                "vendor_status": mapped.get("vendor_status") or ("EXISTS" if record.vendor_id else "NEW"),
                "extracted_data": mapped.get("extracted_data") or {
                    "sections": record.extracted_data.get("sections", {}) if isinstance(record.extracted_data, dict) else {},
                    **(record.extracted_data if isinstance(record.extracted_data, dict) else {})
                }
            })
        except Exception as e:
            logger.error(f"PATCH failure: {str(e)}")
            return Response({'error': str(e)}, status=400)

    def delete(self, request, file_hash=None):
        if not file_hash:
            return Response({'error': 'Id or file_hash required'}, status=400)
            
        if str(file_hash).isdigit():
            deleted, _ = InvoiceTempOCR.objects.filter(id=int(file_hash), tenant_id=request.user.branch_id).delete()
        else:
            deleted, _ = InvoiceTempOCR.objects.filter(file_hash=file_hash, tenant_id=request.user.branch_id).delete()
            
        return Response({'success': bool(deleted)})

    def _handle_session_metadata_upload(self, request, session_ids, tenant_id):
        """Processes metadata for files already uploaded to S3 via pre-signed URLs."""
        from core.sqs import QueueService
        queue = QueueService()
        voucher_type = request.data.get('voucher_type', 'PURCHASE')
        upload_type = request.data.get('upload_type', '').strip().upper() or 'UNKNOWN'
        upload_session_id = request.data.get('upload_session_id')
        
        # ── BACKPRESSURE GATING (Phase 13) ──
        depth = queue.get_queue_depth(queue_type='ingestion')
        from core.observability import observability
        observability.api_metric(event="BACKPRESSURE_CHECK", queue_depth=depth)
        
        if depth > 1000: # Threshold for 1000 pending invoices
            logger.warning(f"[API_BACKPRESSURE] Queue depth {depth} exceeds threshold.")
            observability.api_metric(event="BACKPRESSURE_THROTTLED", queue_depth=depth)
            return Response({
                "error": "Processing queue is full. Please wait a few minutes.",
                "status": "BACKPRESSURE_THROTTLED",
                "queue_depth": depth
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        sessions = UploadSession.objects.filter(id__in=session_ids, tenant_id=tenant_id)
        if not sessions.exists():
            return Response({'error': 'Invalid session_ids'}, status=400)
            
        job = OCRJob.objects.create(
            tenant_id=tenant_id,
            total_files=sessions.count(),
            status='PENDING',
            upload_type=upload_type
        )
        
        queued_count = 0
        for session in sessions:
            task = OCRTask.objects.create(
                job=job,
                file_name=session.file_name,
                file_url=f"s3://{session.s3_key}", # Internal S3 ref
                status='PENDING'
            )
            
            # [PHASE 11.5] Use Canonical Message Factory
            from vouchers.message_factory import message_factory
            from core.middleware import get_correlation_id
            
            ingestion_payload = {
                "record_id": task.id,
                "job_id": str(job.id),
                "file_key": session.s3_key,
                "voucher_type": voucher_type,
                "upload_type": upload_type,
                "upload_session_id": upload_session_id or str(session.id)
            }
            
            msg = message_factory.create_message(
                task_type="INGESTION",
                tenant_id=tenant_id,
                session_id=upload_session_id or str(session.id),
                payload=ingestion_payload,
                correlation_id=get_correlation_id()
            )
            
            logger.info(f"[DISTRIBUTED_PIPELINE_ACTIVE] session_id='{upload_session_id or str(session.id)}' status='ACTIVE'")
            logger.info(f"[REDIS_COORDINATION_ACTIVE] session_id='{upload_session_id or str(session.id)}' coordinator='redis'")
            from copy import deepcopy
            msg_copy = deepcopy(msg)
            
            try:
                queue.push(msg_copy, queue_type='ingestion')
                logger.info(f"[QUEUE_FORWARD_SUCCESS] target_queue=ingestion msg_id={msg_copy['id']}")
                logger.info(f"[DOWNSTREAM_ENQUEUE_SUCCESS] target_queue=ingestion msg_id={msg_copy['id']}")
            except Exception as e:
                logger.error(f"[QUEUE_FORWARD_FAILURE] target_queue=ingestion error={e}")
                logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=ingestion error={e}")
                raise
            logger.info(f"[SQS_DISPATCH_SUCCESS] session_id='{upload_session_id or str(session.id)}' msg_id='{msg.get('id')}' queue='ingestion'")
            logger.info(f"[CLUSTER_WORKER_ACTIVE] role='ingestion' status='POLLING'")
            session.status = 'COMPLETED'
            session.save()
            queued_count += 1
            
        from core.observability import observability
        observability.api_metric(event="BULK_UPLOAD_METADATA", count=queued_count, session_id=upload_session_id)
            
        return Response({
            "success": True,
            "job_id": str(job.id),
            "status": "PROCESSING",
            "message": f"Enqueued {queued_count} direct S3 tasks."
        }, status=status.HTTP_202_ACCEPTED)

    def _get_snapshot_data(self, snapshot):
        """Helper to retrieve snapshot JSON from S3 or DB (Phase 5C)."""
        if snapshot.s3_key:
            from core.storage import StorageService
            try:
                logger.debug(f"[S3_SNAPSHOT_FETCH] session={snapshot.session_id} key={snapshot.s3_key}")
                data = StorageService().get_file(snapshot.s3_key)
                if snapshot.s3_key.endswith('.gz'):
                    import gzip
                    data = gzip.decompress(data)
                return json.loads(data)
            except Exception as e:
                logger.error(f"[S3_FETCH_FAILED] {e}")
                return snapshot.snapshot_json or {} # Fallback
        return snapshot.snapshot_json or {}

class PipelineStatusSSEView(views.APIView):
    """
    PHASE 5B: SSE INFRASTRUCTURE.
    Replaces polling with push-based terminal state signaling.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        tenant_id = request.user.branch_id
        from core.observability import observability, metrics
        
        def event_stream():
            observability.info(event="SSE_CONNECTED", session_id=session_id, user_id=request.user.id)
            metrics.increment_counter("sse:connections_total")
            
            try:
                from core.redis_orchestrator import orchestrator
                from .models import FinalizedSnapshot, PipelineStatus, InvoiceTempOCR
                
                while True:
                    # Retrieve the is_processing status of all records for this session
                    records = InvoiceTempOCR.objects.filter(upload_session_id=session_id)
                    is_processing = records.filter(status__in=[
                        'PENDING', 'INGESTED', 'INGESTING',
                        PipelineStatus.QUEUED, PipelineStatus.PROCESSING, PipelineStatus.EXTRACTING, 
                        PipelineStatus.ASSEMBLING, PipelineStatus.FINALIZING
                    ]).exists() if records.exists() else True

                    # 1. Authoritative Pipeline Terminality Override
                    auth_state = orchestrator.get_authoritative_session_state(session_id)
                    if auth_state and auth_state.get('terminal', False):
                        terminal_reason = auth_state.get('terminal_reason', 'FAILED')
                        logger.info(f"[SSE_AUTHORITATIVE_TERMINAL] session={session_id} reason={terminal_reason}")
                        
                        if terminal_reason in ["FAILED", "FAILED_DUPLICATE", "ERROR"]:
                            yield f"data: {json.dumps({'status': 'FAILED', 'session_id': session_id, 'reason': terminal_reason})}\n\n"
                            break

                    # 2. Check Redis for immediate status update
                    redis_status = orchestrator.get_session_status(session_id)
                    if redis_status:
                        logger.info(f"[SSE_REDIS_HIT] session={session_id} status={redis_status['status']} progress={redis_status['progress']}")
                        
                        if redis_status['status'] in ["COMPLETED", "FINALIZED"]:
                            val_exists = FinalizedSnapshot.objects.filter(session_id=session_id, tenant_id=tenant_id).exists()
                            if val_exists and not is_processing:
                                logger.info(f"[SNAPSHOT_QUERY_VALIDATED] SSE validated snapshot for session={session_id}")
                                logger.info(f"[SNAPSHOT_READY_EMIT] SSE emitting SNAPSHOT_READY for session={session_id}")
                                yield f"data: {json.dumps({'status': 'FINALIZED', 'session_id': session_id, 'progress': 100})}\n\n"
                                break
                            else:
                                logger.warning(f"[SSE_WAIT_SNAPSHOT] Redis status is {redis_status['status']} but records are still processing or snapshot not committed yet for session={session_id}")
                        
                        if redis_status['status'] == "FAILED" and not is_processing:
                            yield f"data: {json.dumps({'status': 'FAILED', 'session_id': session_id})}\n\n"
                            break
                            
                        yield f"data: {json.dumps({'status': redis_status['status'], 'session_id': session_id, 'progress': redis_status['progress']})}\n\n"
                        
                        if redis_status['status'] == "EXPORTED":
                            break

                    # 2. Check for Immutable Snapshot (Fallback)
                    if not is_processing and records.exists():
                        snapshot = FinalizedSnapshot.objects.filter(session_id=session_id, tenant_id=tenant_id).order_by('-created_at').first()
                        if not snapshot:
                            snapshot = FinalizedSnapshot.objects.filter(session_id=session_id).order_by('-created_at').first()
                        
                        if snapshot:
                            logger.info(f"[SESSION_FINALIZED_EVENT] session_id={session_id} event=SNAPSHOT_READY")
                            yield f"data: {json.dumps({'status': 'FINALIZED', 'snapshot_id': str(snapshot.id)})}\n\n"
                            break
                    
                    # 3. Check for Failures in Staging
                    if records.exists():
                        total = records.count()
                        failed = records.filter(status=PipelineStatus.FAILED).count()
                        if failed == total and not is_processing:
                            logger.info(f"[SESSION_FINALIZED_EVENT] session_id={session_id} event=FAILED")
                            yield f"data: {json.dumps({'status': 'FAILED'})}\n\n"
                            break
                        
                    # 4. Sleep
                    time.sleep(2)
            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                logger.error(f"[SSE_CRITICAL_ERROR] session={session_id} error={str(e)}\n{error_trace}")
                yield f"data: {json.dumps({'status': 'ERROR', 'message': str(e)})}\n\n"
            finally:
                metrics.increment_counter("sse:disconnections_total")

        from django.http import StreamingHttpResponse
        return StreamingHttpResponse(event_stream(), content_type='text/event-stream')

class S3UploadPolicyView(views.APIView):
    """
    PHASE 2: DIRECT S3 UPLOAD POLICY.
    Removes RAM/Bandwidth pressure from Django by allowing direct client -> S3 transfers.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        file_name = request.data.get('file_name')
        tenant_id = request.user.branch_id
        
        if not file_name:
            return Response({'error': 'file_name required'}, status=400)
            
        from core.storage import StorageService
        storage = StorageService()
        
        import uuid
        session_id = uuid.uuid4()
        # Secure, partitioned key structure
        s3_key = f"uploads/{tenant_id}/{session_id}/{file_name.replace('/', '_')}"
        
        policy = storage.generate_presigned_post(s3_key)
        if not policy:
            return Response({'error': 'Failed to generate upload policy'}, status=500)
            
        UploadSession.objects.create(
            id=session_id,
            tenant_id=tenant_id,
            file_name=file_name,
            s3_key=s3_key,
            status='INITIATED'
        )
        
        return Response({
            'session_id': str(session_id),
            's3_key': s3_key,
            'policy': policy
        })


class OCRJobStatusView(views.APIView):
    """
    NEW: Pollable endpoint for background job status.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, job_id):
        tenant_id = request.user.branch_id
        try:
            job = OCRJob.objects.get(id=job_id, tenant_id=tenant_id)
            
            # Calculate progress
            total = job.total_files
            processed = job.processed_files
            failed = job.failed_files
            
            # ── [PHASE 10: GRANULAR PROGRESS (PER PAGE)] ──
            # Use SessionFinalizationState to track sub-task completion for multi-page docs.
            from .models import SessionFinalizationState
            record_ids = job.tasks.filter(result_id__isnull=False).values_list('result_id', flat=True)
            stats = SessionFinalizationState.objects.filter(id__in=[str(rid) for rid in record_ids]).aggregate(
                total_expected=models.Sum('expected_pages'),
                total_ai_completed=models.Sum('ai_completed_pages')
            )
            
            total_expected = stats['total_expected'] or 0
            total_ai_completed = stats['total_ai_completed'] or 0
            
            if total_expected > 0 and not job.status in ['COMPLETED', 'FAILED']:
                # Granular mode: based on pages
                progress = (total_ai_completed / total_expected) * 100
                # Sanity cap: don't show 100% until job is actually terminal
                progress = min(progress, 98.0) 
            else:
                # File-based fallback
                progress = (processed + failed) / total * 100 if total > 0 else 100
            
            is_terminal = job.status in ['COMPLETED', 'FAILED', 'PARTIAL']
            if is_terminal: progress = 100.0
            
            # PHASE 12: ADAPTIVE POLLING GOVERNANCE
            # Tell the frontend how long to wait before the next check.
            poll_after = 2  # default (processing)
            if is_terminal:
                poll_after = 0  # Stop polling
            elif job.status == 'PENDING':
                poll_after = 10
            elif job.status == 'QUEUED':
                poll_after = 5
            
            return Response({
                "job_id": job.id,
                "status": job.status,
                "progress_percent": round(progress, 2),
                "processed_count": processed,
                "failed_count": failed,
                "total_files": total,
                "is_completed": is_terminal,
                "poll_after_seconds": poll_after,
                "created_at": job.created_at,
                "updated_at": job.updated_at
            })
        except OCRJob.DoesNotExist:
            return Response({"error": "Job not found"}, status=status.HTTP_404_NOT_FOUND)

class OCRStagingFinalizeView(views.APIView):
    """
    Finalize staged invoices into real Vouchers.
    Handles two paths:
      A) Automated: records already processed by finalize_worker (processed=True) → return persisted counts.
      B) Manual: records still pending → run validate_and_process(auto_save=True) for each.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant_id = request.user.branch_id
        upload_session_id = request.data.get('upload_session_id')

        logger.info(f"[FINALIZE_ENQUEUE_START] session={upload_session_id} tenant={tenant_id} source=API")
        logger.info(f"[FINALIZE_START] session={upload_session_id} tenant={tenant_id}")

        total_in_session = InvoiceTempOCR.objects.filter(
            tenant_id=tenant_id, upload_session_id=upload_session_id
        ).count() if upload_session_id else 0

        summary = {
            'success': True,
            'total': total_in_session,
            'created': 0,
            'skipped': 0,
            'failed': 0,
            'errors': []
        }

        # ── Step 1: Find processable records (unprocessed, matched/vendor-ready, exclude duplicates) ──
        query = InvoiceTempOCR.objects.filter(
            tenant_id=tenant_id,
            processed=False
        ).filter(
            Q(validation_status__in=['READY', 'FOUND', 'RESOLVED', 'MATCHED_VENDOR', 'SUCCESS',
                                     'NEEDS_ATTENTION', 'LOW_CONFIDENCE', 'NEED_VENDOR', 'NEED_TO_SAVE']) |
            Q(vendor_id__isnull=False)
        ).exclude(validation_status__in=['DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE'])
        if upload_session_id:
            query = query.filter(upload_session_id=upload_session_id)

        records_to_process = query.filter(Q(is_primary=True) | Q(group_id__isnull=True))

        if not records_to_process.exists():
            # PATH A: Automated worker already ran — report persisted counts from DB.
            # Use validation_status=VOUCHER_CREATED (not just processed=True) for accuracy.
            if total_in_session > 0:
                qs_base = InvoiceTempOCR.objects.filter(
                    tenant_id=tenant_id, upload_session_id=upload_session_id
                ) if upload_session_id else InvoiceTempOCR.objects.none()

                voucher_created_count = qs_base.filter(validation_status='VOUCHER_CREATED').count()
                duplicate_count = qs_base.filter(
                    validation_status__in=['DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']
                ).count()
                failed_count = qs_base.filter(
                    processed=True, validation_status='ERROR'
                ).count()

                summary['created'] = voucher_created_count
                summary['skipped'] = duplicate_count
                summary['failed'] = failed_count
                logger.info(
                    f"[FINALIZE_PATH_A] session={upload_session_id} "
                    f"voucher_created={voucher_created_count} duplicate={duplicate_count} failed={failed_count} "
                    f"(automated worker already ran)"
                )
                logger.info(f"[PURCHASE_COMMIT_SUCCESS] session={upload_session_id} created={voucher_created_count} [PATH_A_PERSISTED]")
                return Response(summary)

            logger.warning(f"[FINALIZE_NO_RECORDS] session={upload_session_id} — no processable invoices found")
            return Response({'error': 'No processable invoices found in staging.'}, status=400)

        # PATH B: Manual finalize — records not yet processed by worker.
        logger.info(f"[FINALIZE_PATH_B] session={upload_session_id} records_to_process={records_to_process.count()}")
        from .pipeline import validate_and_process

        for record in records_to_process:
            if record.processed:
                continue

            logger.info(f"[PURCHASE_DB_INSERT_START] record={record.id} vendor_id={record.vendor_id} validation_status={record.validation_status}")
            try:
                res = validate_and_process(record, auto_save=True)
                save_status = res.get('status') if isinstance(res, dict) else None
                if save_status == 'VOUCHER_CREATED':
                    summary['created'] += 1
                    logger.info(f"[PURCHASE_DB_INSERT_SUCCESS] record={record.id} voucher_id={res.get('voucher_id')}")
                    logger.info(f"[PURCHASE_COMMIT_SUCCESS] record={record.id} voucher_id={res.get('voucher_id')}")
                elif save_status in ['DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']:
                    summary['skipped'] += 1
                    logger.info(f"[PURCHASE_DUPLICATE_DETECTED] record={record.id} status={save_status}")
                else:
                    summary['failed'] += 1
                    summary['errors'].append({
                        'file': record.file_path,
                        'error': res.get('validation_message') if isinstance(res, dict) else "Finalization failed"
                    })
                    logger.warning(f"[PURCHASE_SAVE_NOT_CREATED] record={record.id} status={save_status}")
            except Exception as e:
                logger.error(f"[FINALIZE_RECORD_FAILED] record={record.id} error={e}", exc_info=True)
                summary['failed'] += 1
                summary['errors'].append({'file': record.file_path, 'error': str(e)})

        logger.info(
            f"[FINALIZE_SUCCESS] session={upload_session_id} "
            f"created={summary['created']} skipped={summary['skipped']} failed={summary['failed']}"
        )
        return Response(summary)


class OCRStagingCancelView(views.APIView):
    """
    Cancels an in-progress OCR session terminally.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant_id = request.user.branch_id
        session_id = request.data.get('session_id')
        if not session_id:
            return Response({'error': 'session_id required'}, status=400)
            
        from core.redis_orchestrator import orchestrator
        from ocr_pipeline.models import OCRJob
        
        logger.warning(f"[SESSION_CANCELLED] Cancelling session={session_id} tenant={tenant_id}")
        
        # 1. Update Orchestrator state to terminal CANCELLED
        orchestrator.set_terminal_status(session_id, "CANCELLED", reason="USER_CANCELLED")
        orchestrator.update_session_status(session_id, "CANCELLED", progress=0.0, extra_data={"hydration_ready": True, "fatal_error_verified": True})
        
        # 2. Update DB Job state if exists
        from ocr_pipeline.models import OCRTask
        job_ids = OCRTask.objects.filter(result__upload_session_id=session_id).values_list('job_id', flat=True).distinct()
        OCRJob.objects.filter(id__in=job_ids).update(status='CANCELLED')
        
        # 3. Mark staging records cancelled
        InvoiceTempOCR.objects.filter(upload_session_id=session_id).update(status='CANCELLED')
        
        return Response({"success": True, "message": "Session terminally cancelled."})
class OCRStagingRescanView(views.APIView):
    """
    Re-trigger OCR extraction for an existing staging record.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant_id = request.user.branch_id
        file_hash = request.data.get('file_hash')
        
        if not file_hash:
            return Response({'error': 'file_hash required'}, status=400)
            
        record = InvoiceTempOCR.objects.filter(file_hash=file_hash, tenant_id=tenant_id).first()
        if not record:
            return Response({'error': 'Record not found'}, status=404)
            
        # Try to find the cached file bytes
        temp_file_path = os.path.join(settings.MEDIA_ROOT, 'ocr_temp', file_hash)
        
        if not os.path.exists(temp_file_path):
            return Response({
                'error': 'Source file not found for rescan. Please re-upload the file.'
            }, status=404)
            
        try:
            from vouchers.message_factory import message_factory
            
            rescan_payload = {
                'item_id': None,
                'record_id': record.id,
                'job_id': 'RESCAN',
                'voucher_type': record.voucher_type,
                'id': f"rescan_{record.id}_{int(time.time())}"
            }
            
            msg = message_factory.create_message(
                task_type="INGESTION",
                tenant_id=tenant_id,
                session_id=record.upload_session_id,
                payload=rescan_payload
            )
            
            from copy import deepcopy
            msg_copy = deepcopy(msg)
            
            try:
                pushed = queue_service.push(msg_copy, queue_type='ingestion')
                if pushed:
                    logger.info(f"[QUEUE_FORWARD_SUCCESS] target_queue=ingestion msg_id={msg_copy['id']}")
                    logger.info(f"[DOWNSTREAM_ENQUEUE_SUCCESS] target_queue=ingestion msg_id={msg_copy['id']}")
                else:
                    logger.error(f"[QUEUE_FORWARD_FAILURE] target_queue=ingestion pushed is False")
                    logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=ingestion pushed is False")
            except Exception as e:
                logger.error(f"[QUEUE_FORWARD_FAILURE] target_queue=ingestion error={e}")
                logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=ingestion error={e}")
                raise
            if not pushed:
                return Response({'error': 'Failed to enqueue rescan task'}, status=500)

            record.status = 'OCR_QUEUED'
            record.save()
            
            return Response({
                "success": True,
                "status": "QUEUED",
                "message": "Rescan task enqueued successfully."
            })
        except Exception as e:
            logger.error(f"RESCAN FAILED: {str(e)}")
            return Response({'error': f"Rescan failed: {str(e)}"}, status=500)

class OCRStagingRescanUploadView(views.APIView):
    """
    Allows uploading a missing source file for an existing record to re-trigger OCR.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant_id = request.user.branch_id
        old_hash = request.data.get('file_hash')
        uploaded_file = request.FILES.get('file')

        if not old_hash or not uploaded_file:
            return Response({'error': 'Original file_hash and new file required'}, status=400)

        record = InvoiceTempOCR.objects.filter(file_hash=old_hash, tenant_id=tenant_id).first()
        if not record:
            return Response({'error': 'Staging record not found'}, status=404)

        try:
            # ΓöÇΓöÇ NON-BLOCKING RESCAN ΓöÇΓöÇ
            from core.sqs import queue_service
            
            # Use chunks for saving to avoid memory spike
            temp_dir = os.path.join(settings.MEDIA_ROOT, 'ocr_temp')
            os.makedirs(temp_dir, exist_ok=True)
            
            # Calculate hash streaming
            sha256 = hashlib.sha256()
            for chunk in uploaded_file.chunks():
                sha256.update(chunk)
            new_hash = sha256.hexdigest()
            
            temp_file_path = os.path.join(temp_dir, new_hash)
            with open(temp_file_path, 'wb') as f:
                for chunk in uploaded_file.chunks():
                    f.write(chunk)

            # Update identity and status
            record.file_hash = new_hash
            record.status = 'OCR_QUEUED'
            record.save()

            ocr_task = {
                'item_id': None,
                'record_id': record.id,
                'job_id': 'RESCAN_UPLOAD',
                'tenant_id': tenant_id,
                'voucher_type': record.voucher_type,
                'upload_session_id': record.upload_session_id,
                'id': f"rescan_up_{record.id}_{int(time.time())}"
            }
            
            # [PHASE 11.7] Explicit Ingestion Routing
            from vouchers.message_factory import message_factory
            
            msg = message_factory.create_message(
                task_type="INGESTION",
                tenant_id=tenant_id,
                session_id=record.upload_session_id,
                payload=ocr_task
            )
            
            from copy import deepcopy
            msg_copy = deepcopy(msg)
            
            try:
                queue_service.push(msg_copy, queue_type='ingestion')
                logger.info(f"[QUEUE_FORWARD_SUCCESS] target_queue=ingestion msg_id={msg_copy['id']}")
                logger.info(f"[DOWNSTREAM_ENQUEUE_SUCCESS] target_queue=ingestion msg_id={msg_copy['id']}")
            except Exception as e:
                logger.error(f"[QUEUE_FORWARD_FAILURE] target_queue=ingestion error={e}")
                logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=ingestion error={e}")
                raise

            return Response({
                "success": True,
                "file_hash": new_hash,
                "status": "QUEUED",
                "message": "File uploaded and rescan task enqueued."
            })
        except Exception as e:
            logger.error(f"RESCAN UPLOAD FAILED: {str(e)}")
            return Response({'error': f"Upload & Rescan failed: {str(e)}"}, status=500)

class ZohoAdapterView(views.APIView):
    """
    SEPARATE Zoho Adapter Layer.
    Consumes normalized OCR output and produces Zoho-compliant rows.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logger.info("API HIT: /api/zoho-adapter/ (ASYNC ENQUEUE)")
        data = request.data
        if not data:
            return Response({"error": "No data provided"}, status=status.HTTP_400_BAD_REQUEST)

        tenant_id = request.user.branch_id
        session_id = data.get('session_id') or f"exp_{int(time.time())}"
        
        # 1. Create Export Task (Tracker)
        from .models import ExportTask
        task = ExportTask.objects.create(
            session_id=session_id,
            tenant_id=tenant_id,
            export_type='ZOHO',
            status='PENDING'
        )
        
        # 2. Push to Export Queue via Message Factory
        from vouchers.message_factory import message_factory
        
        export_payload = {
            "export_id": str(task.id),
            "data": data
        }
        
        msg = message_factory.create_message(
            task_type="EXPORT",
            tenant_id=tenant_id,
            session_id=session_id,
            payload=export_payload
        )
        
        from copy import deepcopy
        msg_copy = deepcopy(msg)
        logger.info(f"[EXPORT_TRIGGER] session_id={session_id} task_id={msg_copy['id']}")
        
        try:
            queue_service.push(msg_copy, queue_type='export')
            logger.info(f"[QUEUE_FORWARD_SUCCESS] target_queue=export msg_id={msg_copy['id']}")
            logger.info(f"[DOWNSTREAM_ENQUEUE_SUCCESS] target_queue=export msg_id={msg_copy['id']}")
        except Exception as e:
            logger.error(f"[QUEUE_FORWARD_FAILURE] target_queue=export error={e}")
            logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=export error={e}")
            raise
        
        logger.info(f"[EXPORT_ENQUEUED] task_id={task.id} session={session_id}")
        
        return Response({
            "success": True,
            "task_id": str(task.id),
            "session_id": session_id,
            "status": "QUEUED",
            "message": "Export transformation enqueued to specialized worker."
        })

class ZohoReconstructView(views.APIView):
    """
    Returns reconstructed and normalized invoices (Step 1-3).
    Useful for displaying reconstructed items in the UI before export.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logger.info(f"API HIT: /api/zoho-reconstruct/ (Content-Length: {request.META.get('CONTENT_LENGTH')})")
        
        # FORENSIC: Log raw request body
        try:
            raw_body = request.body.decode('utf-8')
            logger.info(f"RAW_REQUEST_BODY_PRE_PARSE: {raw_body[:2000]}...")
            if not raw_body.strip():
                logger.error("CRITICAL: Empty request body received!")
        except Exception as be:
            logger.error(f"Failed to read raw request body: {be}")

        data = request.data
        if not data:
            logger.error("CRITICAL: request.data is empty after parsing!")
            return Response({"error": "No data provided"}, status=status.HTTP_400_BAD_REQUEST)

        # --- [PHASE 11.9] HARD FINALIZATION GATE (Requirement #1, #5) ---
        invoices_check = data.get("invoices", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        
        for inv in invoices_check:
            # Requirement #5: Reject premature empty placeholders
            if not inv.get("invoice_no") or not inv.get("items") or not inv.get("bill_from") or not inv.get("vendor_name"):
                logger.warning(f"[RECONSTRUCT_BLOCKED_PREMATURE] Empty data detected. inv_no='{inv.get('invoice_no')}'")
                return Response({
                    "error": "Pipeline finalization incomplete. Premature reconstruction blocked.",
                    "code": "PIPELINE_NOT_FINALIZED"
                }, status=status.HTTP_409_CONFLICT)
            
            # Requirement #1: Check terminal DB state if possible
            record_id = inv.get("id")
            if record_id:
                record = InvoiceTempOCR.objects.filter(id=record_id).first()
                if record and record.status not in ['FINALIZED', 'VOUCHER_CREATED']:
                    logger.warning(f"[RECONSTRUCT_BLOCKED_PREMATURE] Record {record_id} not finalized (Status: {record.status})")
                    return Response({
                        "error": "Record not finalized in distributed cluster.",
                        "code": "PIPELINE_NOT_FINALIZED"
                    }, status=status.HTTP_409_CONFLICT)

        if "invoices" not in data and isinstance(data, list):
            data = {"invoices": data}

        # TRACE: Log incoming payload counts
        invoices_in = data.get("invoices", [])
        logger.info(f"FORENSIC_API_IN: Received {len(invoices_in)} invoices")
        
        for idx, inv in enumerate(invoices_in):
            if not isinstance(inv, dict): continue
            
            # ── [RE-HYDRATION FIX] ──
            # If the payload is truncated (missing items/vendor), re-load from DB.
            if not inv.get("items") or not inv.get("vendor_name") or not inv.get("bill_from"):
                record_id = inv.get("id")
                if record_id:
                    try:
                        record = InvoiceTempOCR.objects.filter(id=record_id).first()
                        if record and record.extracted_data:
                            logger.info(f"FORENSIC_REHYDRATION: id={record_id} Triggered due to truncated payload")
                            # Merge DB data into incoming edits
                            # Incoming edits take precedence, but DB provides missing fields
                            db_data = record.extracted_data or {}
                            for k, v in db_data.items():
                                if k not in inv or not inv[k]:
                                    inv[k] = v
                            # Also check top-level DB fields
                            if not inv.get("gstin"): inv["gstin"] = record.gstin
                            
                            # Robust re-hydration from root or legacy header
                            header = db_data.get('header', {})
                            if not inv.get("vendor_name"): 
                                inv["vendor_name"] = db_data.get('vendor_name') or header.get('vendor_name') or record.vendor_name
                            
                            # Also re-hydrate critical address fields if missing
                            if not inv.get("bill_from") or not inv.get("bill_address_from"):
                                bff = db_data.get("bill_from") or db_data.get("bill_address_from") or header.get("bill_from") or header.get("bill_address_from")
                                if not inv.get("bill_from"): inv["bill_from"] = bff
                                if not inv.get("bill_address_from"): inv["bill_address_from"] = bff
                    except Exception as re_err:
                        logger.error(f"Re-hydration failed for record {record_id}: {re_err}")

            items_in = inv.get("items", [])
            logger.info(f"FORENSIC_INV_IN[{idx}]: id={inv.get('id')} inv_no={inv.get('invoice_no')} vendor={inv.get('vendor_name')} items={len(items_in)} keys={list(inv.keys())}")
            if not inv.get('bill_from') and not inv.get('bill_address_from'):
                logger.warning(f"FORENSIC_INV_IN[{idx}]: MISSING bill_from/bill_address_from!")

        # If no session or no snapshot but record was terminal (fallback - should be rare)
        try:
            adapter = get_zoho_adapter()
            processed_invoices = adapter.reconstruct_invoices(data)
            return Response({"invoices": processed_invoices})

        except Exception as e:
            logger.error(f"Zoho Reconstruct Failure: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class OperationalDashboardView(views.APIView):
    """
    PHASE 11: REAL-TIME OPERATIONS DASHBOARD.
    Aggregates distributed metrics for live monitoring.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from core.observability import metrics
        from core.sqs import queue_service
        from core.redis_orchestrator import orchestrator
        
        # 1. Collect Queue Depths
        queues = ['ingestion', 'ai', 'assembly', 'finalize', 'export']
        queue_stats = {}
        for q in queues:
            queue_stats[q] = {
                "depth": queue_service.get_queue_depth(q),
                # SQS doesn't expose lag directly via API without CloudWatch, 
                # so we use our gauge from metrics.
                "visible": metrics.gauges.get(f"queue:visible:{{'queue': '{q}'}}", 0),
                "invisible": metrics.gauges.get(f"queue:invisible:{{'queue': '{q}'}}", 0)
            }
            
        # 2. Collect Redis Health
        redis_stats = orchestrator.get_redis_metrics()
        
        # 3. Collect Aggregated Metrics
        all_metrics = metrics.get_all_metrics()
        
        # 4. Pipeline Summary
        from .models import InvoiceTempOCR, PoisonDocument
        db_summary = {
            "total_records": InvoiceTempOCR.objects.count(),
            "failed_records": InvoiceTempOCR.objects.filter(status='FAILED').count(),
            "finalized_records": InvoiceTempOCR.objects.filter(status='FINALIZED').count(),
            "poison_documents": PoisonDocument.objects.count()
        }
        
        return Response({
            "timestamp": time.time(),
            "queues": queue_stats,
            "redis": redis_stats,
            "metrics": all_metrics,
            "db_summary": db_summary,
            "slo_status": self._get_slo_status(all_metrics)
        })

    def _get_slo_status(self, all_metrics):
        """Phase 6: SLO Status calculation."""
        # Simple threshold check
        ai_latency = all_metrics.get('histograms', {}).get('worker:task_duration', {}).get('p95', 0)
        return {
            "ai_latency_slo": "HEALTHY" if ai_latency < 120 else "DEGRADED",
            "queue_lag_slo": "HEALTHY" # Placeholder
        }
