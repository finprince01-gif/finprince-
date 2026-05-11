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

from .models import InvoiceTempOCR, OCRJob, OCRTask, FinalizedSnapshot, PipelineStatus, SessionFinalizationState
from .tasks import process_invoice_task
from .service import process_invoice_upload
from .normalize import normalize
from .pipeline import validate_and_process as finalize_record
from .grouping import run_grouping_logic
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
        
        # ── QUEUE BACKEND ENFORCEMENT ──
        queue_backend = os.getenv('QUEUE_BACKEND', 'local')
        if queue_backend != 'redis':
            logger.error(f"Invalid QUEUE_BACKEND: {queue_backend}. Redis-only mode enforced.")
            raise RuntimeError(f"CRITICAL: QUEUE_BACKEND must be 'redis'. Found: {queue_backend}")

        from core.storage import StorageService
        from core.sqs import QueueService
        
        files = request.FILES.getlist('files')
        file_paths = request.data.getlist('file_paths')
        voucher_type = request.data.get('voucher_type', 'PURCHASE')
        upload_session_id = request.data.get('upload_session_id') or request.query_params.get('upload_session_id')
        tenant_id = request.user.branch_id
        
        logger.info(
            f"[SESSION_TRACE_UPLOAD] session={upload_session_id} tenant={tenant_id} "
            f"voucher_type={voucher_type} file_count={len(files)}"
        )

        if not files:
            return Response({'error': 'No files uploaded'}, status=status.HTTP_400_BAD_REQUEST)

        # ── BACKPRESSURE CHECK ──
        # If the queue is too deep, signal the user
        pending_count = OCRTask.objects.filter(status='PENDING').count()
        estimated_delay = 0
        if pending_count > 1000:
            # Estimate: (pending / workers) * 10s
            # Assuming 50 workers
            estimated_delay = (pending_count / 50) * 10
            logger.warning(f"Backpressure active: {pending_count} tasks pending.")

        storage = StorageService()
        queue = QueueService()

        # ── Step 1: Create Job Record ──
        job = OCRJob.objects.create(
            tenant_id=tenant_id,
            total_files=len(files),
            status='PENDING'
        )

        queued_count = 0
        duplicate_count = 0

        # ── Step 2: Process Files ──
        for i, uploaded_file in enumerate(files):
            try:
                # Determine display name (Preserve folder structure if provided)
                original_display_name = file_paths[i] if i < len(file_paths) else uploaded_file.name
                
                file_bytes = uploaded_file.read()
                file_hash = hashlib.sha256(file_bytes).hexdigest()
                
                # ── DEDUPLICATION ──
                # If we already have a successful result for this hash, reuse it
                existing = InvoiceTempOCR.objects.filter(file_hash=file_hash, tenant_id=tenant_id).first()
                if existing and existing.processed:
                    duplicate_count += 1
                    # Link existing result to this job via a special completed task
                    OCRTask.objects.create(
                        job=job,
                        file_name=original_display_name,
                        file_hash=file_hash,
                        status='COMPLETED',
                        result_id=existing.id
                    )
                    job.processed_files += 1
                    continue

                # Upload to storage (local fallback if S3 not configured)
                s3_key = f"ocr/{tenant_id}/{job.id}/{file_hash}_{original_display_name.replace('/', '_')}"
                safe_content_type = uploaded_file.content_type or 'application/octet-stream'
                file_url = storage.upload_file(file_bytes, s3_key, safe_content_type)
                
                # Create Task
                task = OCRTask.objects.create(
                    job=job,
                    file_name=original_display_name,
                    file_url=file_url,
                    file_hash=file_hash,
                    status='PENDING'
                )
                
                # Push to queue (Redis or SQS based on QUEUE_BACKEND)
                queue.push({
                    "task_id": str(task.id),
                    "job_id": str(job.id),
                    "file_url": file_url,
                    "file_hash": file_hash,
                    "voucher_type": voucher_type,
                    "tenant_id": tenant_id,
                    "upload_session_id": upload_session_id,
                    "attempt": 1
                })
                queued_count += 1
                
            except Exception as e:
                logger.error(f"Failed to process file {uploaded_file.name}: {str(e)}")
                job.total_files -= 1
        
        job.save()

        return Response({
            "success": True,
            "job_id": str(job.id),
            "status": "PROCESSING",
            "message": f"Queued {queued_count} files. {duplicate_count} skipped (deduplicated).",
            "total_files": job.total_files,
            "estimated_delay_seconds": round(estimated_delay, 1) if estimated_delay > 0 else 0
        }, status=status.HTTP_202_ACCEPTED)

    def get(self, request, file_hash=None):
        """
        Fetch records from 'invoice_ocr_temp' and format them for the UI.
        Enforced per user debug request: Return ALL if no specific filter.
        """
        session_id = request.query_params.get('upload_session_id')
        tenant_id = request.user.branch_id
        resume = request.query_params.get('resume') == 'true'
        
        print(f"DEBUG: GET OCR Staging. session_id='{session_id}', tenant_id='{tenant_id}', resume='{resume}'")
        
        # ── ASYNC PIPELINE STATUS CONSTANTS ──
        ASYNC_IN_PROGRESS_STATUSES = {
            'PROCESSING', 'OCR_PROCESSING', 'OCR_QUEUED',
            'AI_QUEUED', 'AI_PROCESSING', 'UPLOADING',
            'FINALIZATION_RUNNING', 'SNAPSHOT_BUILDING'
        }
        TERMINAL_STATUSES = {PipelineStatus.FINALIZED, PipelineStatus.FAILED}

        file_paths = request.query_params.get('file_paths')
        
        # ── Step 3: Verify API Source (Per Request: Minimal Filtering for Debug) ──
        if file_hash:
            if str(file_hash).isdigit():
                records = InvoiceTempOCR.objects.filter(id=int(file_hash), tenant_id=tenant_id)
            else:
                records = InvoiceTempOCR.objects.filter(
                    Q(file_hash=file_hash) | Q(upload_session_id=file_hash),
                    tenant_id=tenant_id
                )
        elif session_id:
            logger.info(f"[UI_SNAPSHOT_FETCH] session_id={session_id}")
            # Filter to only non-empty snapshots (invoice_count > 0)
            # Old failed runs produce empty snapshots (invoice_count=0) — exclude them.
            snapshots = FinalizedSnapshot.objects.filter(
                session_id=session_id, tenant_id=tenant_id, invoice_count__gt=0
            ).order_by('created_at')

            if snapshots.exists():
                latest_snap = snapshots.latest('created_at')
                snap_data = latest_snap.snapshot_json or {}
                invoices = snap_data.get('invoices', [])
                
                # Attempt to find a real record ID for session reference
                ref_record = InvoiceTempOCR.objects.filter(upload_session_id=session_id, tenant_id=tenant_id).first()
                ref_id = ref_record.id if ref_record else str(latest_snap.id)

                # Wrap invoices into the "record-like" structure the UI mapper expects
                records_data = []
                for inv in invoices:
                    records_data.append({
                        "id": ref_id,
                        "status": PipelineStatus.FINALIZED,
                        "validationStatus": "READY",
                        "db_status": PipelineStatus.FINALIZED,
                        "extracted_data": inv,
                        "file_path": inv.get("Folder Path", ""),
                        "invoice_no": inv.get("Invoice No", ""),
                        "branch": inv.get("Branch", ""),
                        "Branch": inv.get("Branch", ""),
                        "vendor_name": inv.get("Name", ""),
                        "vendor_gstin": inv.get("GSTIN", ""),
                        "total_amount": inv.get("Total Invoice Value", "0.00"),
                        "file_hash": str(latest_snap.id)
                    })

                logger.info(f"[SNAPSHOT_AGGREGATE] session={session_id} union_count={len(records_data)} from latest snapshot {latest_snap.id}")
                return Response({
                    "status": "completed",
                    "data": records_data,
                    "snapshot_id": str(latest_snap.id)
                })

            # If no snapshot exists, check if any record is still processing.
            records = InvoiceTempOCR.objects.filter(upload_session_id=session_id, tenant_id=tenant_id)
            if records.exists():
                # Mandatory Fix #6: Authoritative Progress Calculation
                states = SessionFinalizationState.objects.filter(id__in=records.values_list('id', flat=True))
                logger.info(f"[FORENSIC_STAGING_QUERY] session={session_id} found_states={states.count()} records={records.count()}")
                
                total_expected = sum(s.total_pages_expected for s in states)
                total_completed = sum(s.total_pages_completed for s in states)
                
                # Fallback if states not created yet
                if total_expected == 0:
                    total_expected = records.count() # Assume 1 page per record as fallback
                    total_completed = records.filter(status__in=TERMINAL_STATUSES).count()

                progress = (total_completed / total_expected * 100) if total_expected > 0 else 0
                logger.info(f"[PROGRESS_SYNC] session={session_id} progress={progress}% ({total_completed}/{total_expected})")

                is_terminal = all(r.status in TERMINAL_STATUSES for r in records)

                # If progress is 100% from SessionFinalizationState but record status
                # hasn't updated to FINALIZED yet (assembly in-flight), don't block.
                # We ignore FINALIZATION_RUNNING and SNAPSHOT_BUILDING here because 
                # progress=100 means the extraction phase is terminal.
                if not is_terminal and progress >= 100:
                    ignore_statuses = {
                        PipelineStatus.FINALIZATION_RUNNING, 
                        PipelineStatus.SNAPSHOT_BUILDING,
                        'FINALIZATION_RUNNING',
                        'SNAPSHOT_BUILDING'
                    }
                    all_pipeline_done = all(
                        r.status in TERMINAL_STATUSES or r.status in ignore_statuses
                        for r in records
                    )
                    if all_pipeline_done:
                        is_terminal = True
                        logger.info(f"[UI_UNBLOCK_PROGRESS100] session={session_id} — progress=100%, treating as terminal.")

                if not is_terminal:
                    logger.info(f"[UI_RENDER_BLOCKED] session={session_id} - Pipeline in progress.")
                    return Response({
                        "status": "PROCESSING",
                        "progress_percent": round(progress, 2),
                        "message": f"AI is finalizing assembly ({total_completed}/{total_expected})...",
                        "data": [] # Return empty data to prevent ghost row rendering
                    })
            
            # Fallback for terminal records without snapshot (unlikely)
            records = records.order_by('created_at', 'id')
            logger.info(f"[BACKEND_STAGING_FETCH] session={session_id} record_count={records.count()}")
        elif file_paths:
            paths = file_paths.split(',')
            records = InvoiceTempOCR.objects.filter(file_path__in=paths, tenant_id=tenant_id).order_by('created_at', 'id')
        elif resume:
            # Resuming: fetch all unprocessed records for this tenant
            records = InvoiceTempOCR.objects.filter(tenant_id=tenant_id, processed=False).order_by('-created_at', '-id')
        else:
            print(f"DEBUG: No session ID, file_paths or resume flag provided. Returning empty list.")
            records = InvoiceTempOCR.objects.none()

        # ── Step 3.5: Apply Grouping filter (Commented out to allow frontend toggling of all pages) ──
        # if records.exists():
        #     records = records.filter(Q(is_primary=True) | Q(group_id__isnull=True))

        # ── Step 4: Optional Filter ──
        v_filter = request.query_params.get('filter')
        if v_filter == 'create_vendor':
            # Filter ONLY records that explicitly need vendor registration.
            # Do NOT use vendor_id__isnull=True — matched records may also have null vendor_id.
            records = records.filter(
                validation_status__in=['NEED_VENDOR', 'VENDOR_MISSING', 'NOT_FOUND', 'CREATE_VENDOR']
            )
            print(f"DEBUG: Applied 'create_vendor' filter (by status). Now matching {records.count()} records.")
            
        print(f"DEBUG: API Returning {records.count()} records to UI.")
            
        data = []
        for r in records:
            # Matches existing DB schema (extracted_data contains the hierarchical sections)
            norm = r.extracted_data or {}
            v_status = getattr(r, 'validation_status', None)
            v_id = getattr(r, 'vendor_id', None)
            v_status_record = getattr(r, 'status', None)

            # ── ASYNC-SAFE UI STATUS MAPPING ──
            # Priority: terminal error > in-progress async > voucher created > validation status
            #
            # RULE: Never map a record to FAILED/EXTRACTION_FAILED while it is still in
            # an async pipeline stage. Only do so once it has reached a true terminal state.
            
            # ── PHASE 6: UI STABILIZATION ──
            # Rule: Never expose intermediate payloads.
            # Exception: allow SNAPSHOT_BUILDING if assembly has already saved the final data.
            is_stabilized = (
                v_status_record == PipelineStatus.FINALIZED or 
                v_status_record == PipelineStatus.FAILED or
                (v_status_record == PipelineStatus.SNAPSHOT_BUILDING and 'invoices' in norm)
            )
            
            if not is_stabilized:
                ui_status = 'PROCESSING'
                # [UI_RENDER_BLOCKED]
                norm = {"message": "Finalizing assembly...", "_blocked": True}
                logger.info(f"[UI_RENDER_BLOCKED] record={r.id} status={v_status_record}")
                # Empty data to prevent partial renders
                row_data = {
                    "id": r.id,
                    "status": "PROCESSING",
                    "db_status": v_status_record,
                    "validationStatus": "PROCESSING",
                    "_blocked": True
                }
                data.append(row_data)
                continue
            else:
                # [UI_RENDER_ALLOWED]
                logger.info(f"[UI_RENDER_ALLOWED] record={r.id} status={v_status_record}")
                if v_status_record == 'FAILED' or v_status_record == 'OCR_FAILED':
                    ui_status = 'EXTRACTION_FAILED'
                elif v_status_record == 'VOUCHER_CREATED' or r.processed is True:
                    ui_status = 'VOUCHER_CREATED'
                else:
                    ui_status = v_status or 'PENDING'
                
                # If it's a COMPLETED aggregate record, it should have been exploded already.
                # The children will have status=EXTRACTED and their own data.
                pass

            sections = norm.get("sections", {})
            supplier = sections.get("supplier_details", {})

            # Use derived branch from DB field or extract from norm
            branch = r.branch or supplier.get("branch") or norm.get("branch") or "—"

            # ── PER-ROW STATUS (used by frontend polling stop logic) ──
            # IMPORTANT: Only return 'SUCCESS' when the record has genuinely completed
            # async processing (EXTRACTED, VOUCHER_CREATED). FAILED is also terminal.
            # Do NOT include in-progress states here.
            row_pipeline_status = 'PROCESSING'
            if v_status_record in TERMINAL_STATUSES:
                row_pipeline_status = 'SUCCESS'

            row_data = {
                "id": r.id,
                "file_hash": r.file_hash,
                "file_path": r.file_path,
                "tenant_id": r.tenant_id,
                # invoice_number is None when strict validation found nothing valid.
                # Display '—' in UI rather than null/garbage.
                "invoice_no": r.supplier_invoice_no or norm.get("invoice_no") or norm.get("invoice_number") or supplier.get("supplier_invoice_no") or "—",
                "invoice_number": r.supplier_invoice_no or norm.get("invoice_number") or norm.get("invoice_no") or supplier.get("supplier_invoice_no") or "—",
                "invoice_status": norm.get("invoice_status") or ("MISSING" if not (r.supplier_invoice_no or norm.get("invoice_number")) else "FOUND"),
                "sales_invoice_no": r.supplier_invoice_no or norm.get("sales_invoice_no") or norm.get("supplier_invoice_no") or "—",
                "invoice_date": norm.get("invoice_date") or supplier.get("invoice_date") or "—",
                "total_amount": norm.get("total_invoice_value") or norm.get("total_amount") or "0.00",
                "branch": branch,
                "Branch": branch,
                "vendor_name": supplier.get("vendor_name") or norm.get("vendor_name") or "—",
                "vendor_gstin": r.gstin or supplier.get("gstin") or norm.get("gstin") or "—",
                "gstin": r.gstin or supplier.get("gstin") or norm.get("gstin") or "—",
                "irn": norm.get("irn") or supplier.get("irn") or "—",
                "ack_no": norm.get("ack_no") or supplier.get("ack_no") or "—",
                "ack_date": norm.get("ack_date") or supplier.get("ack_date") or "—",
                "vendor_id": v_id,
                # status: 'SUCCESS' means this record is done (terminal). 'PROCESSING' means wait.
                "status": row_pipeline_status,
                # db_status: raw DB status for debugging in browser devtools
                "db_status": v_status_record,
                "validationStatus": ui_status,
                "validation_status": ui_status,
                "vendor_status": "EXISTS" if (ui_status in ["FOUND", "READY", "RESOLVED", "VOUCHER_CREATED", "DUPLICATE"] or v_id) else "NEW",
                "processed": r.processed,
                "is_primary": r.is_primary,
                "group_id": r.group_id,
                "has_source": os.path.exists(os.path.join(settings.MEDIA_ROOT, 'ocr_temp', r.file_hash)) if r.file_hash else False,
                "extracted_data": {
                    "sections": sections,
                    "bill_from": norm.get("bill_address_from") or norm.get("bill_from") or supplier.get("bill_from") or supplier.get("vendor_address") or norm.get("vendor_address") or "",
                    "bill_address_from": norm.get("bill_address_from") or norm.get("Bill Address From") or "",
                    "Bill Address From": norm.get("Bill Address From") or norm.get("bill_address_from") or "",
                    "billing_address": norm.get("bill_address_to") or norm.get("billing_address") or supplier.get("billing_address") or norm.get("billing_address") or supplier.get("bill_to") or norm.get("bill_to") or "",
                    "bill_address_to": norm.get("bill_address_to") or norm.get("Bill Address To") or "",
                    "Bill Address To": norm.get("Bill Address To") or norm.get("bill_address_to") or "",
                    "Place of Supply": norm.get("place_of_supply") or supplier.get("place_of_supply") or "",
                    "place_of_supply": norm.get("place_of_supply") or supplier.get("place_of_supply") or "",
                    "Branch": branch,
                    "branch": branch,
                    **norm
                },
                "created_at": r.created_at,
                "voucher_type": r.voucher_type
            }
            data.append(row_data)

        # ── PIPELINE-LEVEL STATUS (controls frontend polling) ──
        # 'completed' → frontend stops polling. Use ONLY when ALL records are terminal.
        # 'processing' → frontend keeps polling.
        # A record with FAILED/EXTRACTION_FAILED is terminal — but the pipeline is
        # only "done" when every single record has exited the async pipeline.
        all_terminal = records.exists() and all(
            getattr(r, 'status', None) in TERMINAL_STATUSES for r in records
        )
        pipeline_status = 'completed' if all_terminal else 'processing'

        logger.info(
            f"[STAGING POLL] session={request.query_params.get('upload_session_id')} "
            f"records={len(data)} terminal={sum(1 for r in records if getattr(r,'status',None) in TERMINAL_STATUSES)} "
            f"pipeline_status={pipeline_status}"
        )

        return Response({
            "status": pipeline_status,
            "data": data
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
            
            progress = (processed + failed) / total * 100 if total > 0 else 100
            
            return Response({
                "job_id": job.id,
                "status": job.status,
                "progress_percent": round(progress, 2),
                "processed_count": processed,
                "failed_count": failed,
                "total_files": total,
                "is_completed": job.status in ['COMPLETED', 'FAILED', 'PARTIAL'],
                "created_at": job.created_at,
                "updated_at": job.updated_at
            })
        except OCRJob.DoesNotExist:
            return Response({"error": "Job not found"}, status=status.HTTP_404_NOT_FOUND)

    def patch(self, request, file_hash=None):
        """
        Step 3: Fix normalization on manual edits.
        """
        from vendors.vendor_validation_logic import validate_vendor
        
        if not file_hash:
            return Response({'error': 'Id or file_hash required'}, status=400)
            
        record = InvoiceTempOCR.objects.filter(file_hash=file_hash, tenant_id=request.user.branch_id).first()
        if not record:
            record = InvoiceTempOCR.objects.filter(id=int(file_hash) if str(file_hash).isdigit() else None).first()
            
        if not record:
            return Response({'error': 'File not found'}, status=404)
            
        updated_data = request.data.get('extracted_data')
        if not updated_data:
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
            normalized_patch = normalize(updated_data)
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
            
            return Response({
                "success": True, 
                "status": record.validation_status,
                "vendor_id": record.vendor_id,
                "vendor_name": (
                    sections.get('supplier_details', {}).get('vendor_name') or
                    updated_data.get('vendor_name') or ''
                ),
                "extracted_data": {
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

class OCRStagingFinalizeView(views.APIView):
    """
    Finalize staged invoices into real Vouchers.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant_id = request.user.branch_id
        upload_session_id = request.data.get('upload_session_id')
        
        # ── Step 1: Find processable records (READY/Matched Only - Exclude Duplicates) ──
        # We include ANY record that has a vendor_id, even if status is NEED_VENDOR (syncing issue)
        query = InvoiceTempOCR.objects.filter(
            tenant_id=tenant_id,
            processed=False
        ).filter(
            Q(validation_status__in=['READY', 'FOUND', 'RESOLVED', 'MATCHED_VENDOR', 'SUCCESS', 'NEEDS_ATTENTION', 'LOW_CONFIDENCE', 'NEED_VENDOR']) |
            Q(vendor_id__isnull=False)
        ).exclude(validation_status__in=['DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE'])
        if upload_session_id:
            query = query.filter(upload_session_id=upload_session_id)
            
        records_to_process = query.all()
        
        # ── Step 2: Build Summary (Including already processed session records) ──
        session_query = InvoiceTempOCR.objects.filter(tenant_id=tenant_id)
        if upload_session_id:
            session_query = session_query.filter(upload_session_id=upload_session_id)
        
        all_session_records = session_query.all()
        
        # Base counts from current session state (only count those already processed/finalized)
        created_count = session_query.filter(processed=True).exclude(voucher_id=None).count()
        skipped_count = session_query.filter(processed=True, validation_status__in=['DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']).count()
        failed_count = session_query.filter(processed=True, status='FAILED').count()

        summary = {
            'total': len(all_session_records), 
            'created': created_count,
            'skipped': skipped_count,
            'failed': failed_count,
            'errors': []
        }
        
        if not records_to_process and not all_session_records:
            return Response({'error': 'No processable invoices found in staging.'}, status=400)

        # ── Step 3: Progressive Processing (Grouped for Multi-Page) ──
        # We process ONLY primary records, but fetch all group members to pass to the merging pipeline
        groups = {}
        processed_group_ids = set()

        # Collect all primary records and standalone records
        primaries = records_to_process.filter(Q(is_primary=True) | Q(group_id__isnull=True))

        for primary in primaries:
            if primary.group_id:
                # Fetch all members of this group in order
                group_members = list(InvoiceTempOCR.objects.filter(
                    group_id=primary.group_id, 
                    tenant_id=tenant_id
                ).order_by('created_at', 'id'))
                key = primary.group_id
            else:
                group_members = [primary]
                key = f"UNGROUPED_{primary.id}"
            
            groups[key] = group_members

        from .pipeline import finalize_merged_records
        for key, group_records in groups.items():
            # Check if any record in group is already processed (safety)
            if any(r.processed for r in group_records):
                continue
                
            res = finalize_merged_records(group_records, auto_save=True)
            
            if res.get('status') == 'VOUCHER_CREATED':
                summary['created'] += 1
            elif res.get('status') in ['DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']:
                summary['skipped'] += 1
            else:
                summary['failed'] += 1
                summary['errors'].append({'key': key, 'error': res.get('error')})

        summary['success'] = True
        return Response(summary)

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
            # ── NON-BLOCKING RESCAN ──
            # Instead of running the pipeline here, we push to the OCR queue.
            # The worker will pick it up and process it asynchronously.
            from core.redis_client import redis_client
            
            ocr_task = {
                'item_id': None, # This is a direct rescan on a staging record
                'record_id': record.id,
                'job_id': 'RESCAN',
                'tenant_id': tenant_id,
                'voucher_type': record.voucher_type,
                'upload_session_id': record.upload_session_id,
                'id': f"rescan_{record.id}_{int(time.time())}"
            }
            
            pushed = redis_client.enqueue("ocr_queue", ocr_task)
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
            # ── NON-BLOCKING RESCAN ──
            from core.redis_client import redis_client
            
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
            
            redis_client.enqueue("ocr_queue", ocr_task)

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
        logger.info("API HIT: /api/zoho-adapter/")
        data = request.data
        if not data:
            return Response({"error": "No data provided"}, status=status.HTTP_400_BAD_REQUEST)

        # Expecting format: {"invoices": [...]}
        if "invoices" not in data and isinstance(data, list):
            data = {"invoices": data}

        try:
            adapter = get_zoho_adapter()
            result = adapter.transform(data)
            return Response(result)
        except Exception as e:
            logger.error(f"Zoho Adapter Failure: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ZohoReconstructView(views.APIView):
    """
    Returns reconstructed and normalized invoices (Step 1-3).
    Useful for displaying reconstructed items in the UI before export.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logger.info("API HIT: /api/zoho-reconstruct/")
        data = request.data
        if not data:
            return Response({"error": "No data provided"}, status=status.HTTP_400_BAD_REQUEST)

        if "invoices" not in data and isinstance(data, list):
            data = {"invoices": data}

        # TRACE: Log incoming payload safely
        # ── PHASE 7: RECONSTRUCT API SAFETY ──
        invoices_in = data.get("invoices", [])
        
        # ── MANDATORY FIX #2 & #10: RECONSTRUCT MUST USE SNAPSHOT ──
        session_id = None
        for inv in invoices_in:
            rid = inv.get('id')
            if rid:
                # ── MANDATORY FIX #11: TYPE SAFETY FOR ID ──
                record = None
                if isinstance(rid, int) or (isinstance(rid, str) and rid.isdigit()):
                    record = InvoiceTempOCR.objects.filter(id=rid).first()
                
                if record:
                    session_id = record.upload_session_id
                    # [PHASE 7] HARD RECONSTRUCT API BARRIER
                    if record.status != PipelineStatus.FINALIZED:
                        logger.warning(f"[RECONSTRUCT_BLOCKED] record={rid} status={record.status}")
                        return Response({
                            "status": "PROCESSING",
                            "message": "Pipeline not finalized. Please wait.",
                            "current_stage": record.status
                        }, status=status.HTTP_202_ACCEPTED)
                else:
                    # If ID is not a numeric record ID, it might be a UUID from a snapshot.
                    # We'll try to find the session_id from the first record in the request
                    # or from the snapshot itself if we can.
                    pass
        
        if session_id:
            snapshot = FinalizedSnapshot.objects.filter(session_id=session_id).order_by('-created_at').first()
            if snapshot:
                logger.info(f"[SNAPSHOT_RECONSTRUCT_REDIRECT] Using snapshot data for session={session_id}")
                # We return the snapshot data directly as the 'reconstructed' result.
                # This ensures the UI only ever sees the canonical DTO.
                return Response({"invoices": snapshot.snapshot_json.get("invoices", [])})

        # If no session or no snapshot but record was terminal (fallback - should be rare)
        try:
            adapter = get_zoho_adapter()
            processed_invoices = adapter.reconstruct_invoices(data)
            return Response({"invoices": processed_invoices})

        except Exception as e:
            logger.error(f"Zoho Reconstruct Failure: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return Response({
                "error": str(e),
                "ready_for_zoho": False,
                "status": "PARTIAL_ERROR"
            }, status=status.HTTP_200_OK) # Return 200 to prevent frontend crash
