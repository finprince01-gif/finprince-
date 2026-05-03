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

from .service import process_invoice_upload
from .normalize import normalize
from .repository import InvoiceTempOCR
from .pipeline import validate_and_process as finalize_record
from .grouping import run_grouping_logic
from .zoho_adapter import get_zoho_adapter

logger = logging.getLogger(__name__)

logger = logging.getLogger(__name__)

class CleanOCRStagingView(views.APIView):
    """
    Step 3: Fix API Response.
    Isolated from legacy 'vouchers.staging_api'.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Handle invoice upload and trigger the new hardened pipeline.
        """
        files = request.FILES.getlist('files')
        voucher_type = request.data.get('voucher_type', 'PURCHASE')
        upload_session_id = request.data.get('upload_session_id') or request.query_params.get('upload_session_id')
        tenant_id = request.user.branch_id

        if not files:
            return Response({'error': 'No files uploaded'}, status=status.HTTP_400_BAD_REQUEST)

        import concurrent.futures
        from django.db import connection

        def process_file_item(uploaded_file):
            try:
                # Need to reset connection for each thread in Django if using DB
                # Actually for small tasks it might be okay, but safer to wrap
                # process_invoice_upload handles its own DB transactions usually.
                file_bytes = uploaded_file.read()
                file_hash = hashlib.sha256(file_bytes).hexdigest()
                
                temp_dir = os.path.join(settings.MEDIA_ROOT, 'ocr_temp')
                if not os.path.exists(temp_dir):
                    os.makedirs(temp_dir)
                
                temp_file_path = os.path.join(temp_dir, file_hash)
                if not os.path.exists(temp_file_path):
                    with open(temp_file_path, 'wb') as f:
                        f.write(file_bytes)
                
                return process_invoice_upload(
                    file_bytes=file_bytes,
                    voucher_type=voucher_type,
                    file_name=uploaded_file.name,
                    upload_session_id=upload_session_id,
                    tenant_id=tenant_id
                )
            except Exception as e:
                logger.error(f"Threaded API Processing failure: {str(e)}")
                return {"file_name": uploaded_file.name, "status": "FAILED", "error": str(e)}
            finally:
                connection.close()

        print(f"DEBUG: Processing upload for {len(files)} files in PARALLEL. Branch: {tenant_id}")
        results = []
        # Support up to 6 concurrent extractions to maximize throughput without hitting AI rate limits too hard
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            results = list(executor.map(process_file_item, files))

        # STEP 5: Run Grouping Preprocessor (Multi-page Merge)
        try:
            run_grouping_logic(tenant_id, upload_session_id)
        except Exception as ge:
            logger.error(f"Grouping preprocessor failed: {str(ge)}")

        return Response({
            "success": True,
            "status": "SUCCESS",
            "results": results,
            "duplicate_count": sum(1 for r in results if r.get('is_duplicate'))
        })

    def get(self, request, file_hash=None):
        """
        Fetch records from 'invoice_ocr_temp' and format them for the UI.
        Enforced per user debug request: Return ALL if no specific filter.
        """
        session_id = request.query_params.get('upload_session_id')
        tenant_id = request.user.branch_id
        resume = request.query_params.get('resume') == 'true'
        
        print(f"DEBUG: GET OCR Staging. session_id='{session_id}', tenant_id='{tenant_id}', resume='{resume}'")
        
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
            records = InvoiceTempOCR.objects.filter(upload_session_id=session_id, tenant_id=tenant_id).order_by('created_at', 'id')
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
            
            # Robust mapping for UI status badges
            ui_status = v_status or "PENDING"
            if v_status in ['DUPLICATE', 'DUPLICATE_INVOICE', 'DUPLICATE_IN_BATCH']:
                ui_status = 'DUPLICATE'
            elif v_status_record == 'FAILED': 
                ui_status = 'EXTRACTION_FAILED'
            elif v_status_record == 'VOUCHER_CREATED' or r.processed is True:
                ui_status = 'VOUCHER_CREATED'
            elif v_status_record in ['EXTRACTING', 'UPLOADED', 'PENDING']: 
                ui_status = 'PENDING'
            elif v_status in ['DUPLICATE', 'DUPLICATE_INVOICE', 'DUPLICATE_IN_BATCH']:
                ui_status = 'DUPLICATE'
            
            sections = norm.get("sections", {})
            supplier = sections.get("supplier_details", {})
            
            # Use derived branch from DB field or extract from norm
            branch = r.branch or supplier.get("branch") or norm.get("branch") or "—"
            
            row_data = {
                "id": r.id,
                "file_hash": r.file_hash,
                "file_path": r.file_path,
                "tenant_id": r.tenant_id,
                "invoice_number": r.supplier_invoice_no or norm.get("supplier_invoice_no") or supplier.get("supplier_invoice_no") or norm.get("invoice_no") or "—",
                "sales_invoice_no": r.supplier_invoice_no or norm.get("sales_invoice_no") or norm.get("supplier_invoice_no") or "—",
                "invoice_date": norm.get("invoice_date") or supplier.get("invoice_date") or "—",
                "total_amount": norm.get("total_invoice_value") or norm.get("total_amount") or "0.00",
                "branch": branch,
                "vendor_name": supplier.get("vendor_name") or norm.get("vendor_name") or "—",
                "vendor_gstin": r.gstin or supplier.get("gstin") or norm.get("gstin") or "—",
                "gstin": r.gstin or supplier.get("gstin") or norm.get("gstin") or "—",
                "vendor_id": v_id,
                "status": "SUCCESS" if v_status_record in ["EXTRACTED", "FAILED", "VOUCHER_CREATED"] else "PROCESSING",
                "validationStatus": ui_status,
                "validation_status": ui_status,
                "vendor_status": "EXISTS" if (ui_status in ["FOUND", "READY", "RESOLVED", "VOUCHER_CREATED", "DUPLICATE"] or v_id) else "NEW",
                "processed": r.processed,
                "has_source": os.path.exists(os.path.join(settings.MEDIA_ROOT, 'ocr_temp', r.file_hash)) if r.file_hash else False,
                "extracted_data": {
                    "sections": sections,
                    "bill_from": norm.get("bill_from") or supplier.get("bill_from") or supplier.get("vendor_address") or norm.get("vendor_address") or "",
                    "billing_address": supplier.get("billing_address") or norm.get("billing_address") or supplier.get("bill_to") or norm.get("bill_to") or "",
                    "Bill Address To": supplier.get("billing_address") or norm.get("billing_address") or supplier.get("bill_to") or norm.get("bill_to") or "",
                    "Place of Supply": norm.get("place_of_supply") or supplier.get("place_of_supply") or "",
                    "place_of_supply": norm.get("place_of_supply") or supplier.get("place_of_supply") or "",
                    **norm
                }, 
                "created_at": r.created_at,
                "voucher_type": r.voucher_type
            }
            data.append(row_data)

        return Response({
            "status": "SUCCESS" if all(getattr(r, 'status', '') in ["EXTRACTED", "FAILED", "VOUCHER_CREATED"] for r in records) else "processing",
            "data": data
        })

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
            record.status = 'EXTRACTED'
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
            with open(temp_file_path, 'rb') as f:
                file_bytes = f.read()
                
            from .pipeline import run_ocr_pipeline
            record.status = 'EXTRACTING'
            record.validation_status = 'PENDING'
            record.save()
            
            execution_res = run_ocr_pipeline(file_bytes, record)
            
            # Re-run grouping in case rescan fixed details that allow merging
            try:
                from .grouping import run_grouping_logic
                run_grouping_logic(tenant_id, record.upload_session_id)
            except: pass
            
            return Response({
                "success": True,
                "status": "EXTRACTED",
                "validation_status": execution_res.get('validation', {}).get('status', 'ERROR'),
                "data": execution_res.get('data', {})
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
            file_bytes = uploaded_file.read()
            new_hash = hashlib.sha256(file_bytes).hexdigest()

            # Save to ocr_temp
            temp_dir = os.path.join(settings.MEDIA_ROOT, 'ocr_temp')
            if not os.path.exists(temp_dir):
                os.makedirs(temp_dir)

            temp_file_path = os.path.join(temp_dir, new_hash)
            with open(temp_file_path, 'wb') as f:
                f.write(file_bytes)

            # Update identity and status
            record.file_hash = new_hash
            record.status = 'EXTRACTING'
            record.validation_status = 'PENDING'
            record.save()

            from .pipeline import run_ocr_pipeline
            execution_res = run_ocr_pipeline(file_bytes, record)

            return Response({
                "success": True,
                "file_hash": new_hash,
                "status": "EXTRACTED",
                "validation_status": execution_res.get('validation', {}).get('status', 'ERROR'),
                "data": execution_res.get('data', {})
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
        invoices_in = data.get("invoices", [])
        if invoices_in and isinstance(invoices_in, list) and isinstance(invoices_in[0], dict):
            logger.info(f"TRACE_API_IN: First invoice incoming vendor_address: {invoices_in[0].get('vendor_address')}")
            logger.info(f"TRACE_API_IN: First invoice incoming bill_from: {invoices_in[0].get('bill_from')}")

        try:
            adapter = get_zoho_adapter()
            processed_invoices = adapter.reconstruct_invoices(data)
            
            # TRACE: Log outgoing payload safely
            if processed_invoices and isinstance(processed_invoices, list) and isinstance(processed_invoices[0], dict):
                logger.info(f"TRACE_API_OUT: First invoice outgoing bill_from: {processed_invoices[0].get('bill_from')}")

            print("FINAL API RESPONSE:", processed_invoices)
            for inv in processed_invoices:
                if not inv.get("bill_from"):
                    print("BROKEN RECORD:", inv)
                    raise Exception("CRITICAL: bill_from empty or missing")

            return Response({"invoices": processed_invoices})


        except Exception as e:
            logger.error(f"Zoho Reconstruct Failure: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
