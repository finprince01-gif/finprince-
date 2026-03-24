from rest_framework import views, status # pyre-fixme
from rest_framework.response import Response # pyre-fixme
from rest_framework.permissions import IsAuthenticated # pyre-fixme
from django.db import transaction # pyre-fixme
from django.utils import timezone # pyre-fixme
import logging
import json
import os
import io

from core.ocr_cache import ( # pyre-fixme
    get_all_staged_invoices,
    remove_staged_invoice,
    clear_staged_invoices,
    compute_file_hash,
    save_ocr_cache,
    get_cached_ocr,
    remove_processed_invoices,
    mark_invoice_as_processed,
    update_ocr_cache_session,
    update_staged_invoice_extracted_data
)
from core.ai_service import create_dynamic_voucher_extraction_request # pyre-fixme
from core.usage_service import check_and_increment_usage # pyre-fixme
from vendors.models import VendorMasterBasicDetail, VendorMasterGSTDetails # pyre-fixme
from vendors.vendor_validation_logic import validate_vendor # pyre-fixme
from core.processing_engine import run_invoice_processing_pipeline, parse_and_process_ocr # pyre-fixme
from accounting.serializers_voucher_purchase import VoucherPurchaseSupplierDetailsSerializer # pyre-fixme

from vouchers.pipeline.health import SystemHealth
from .models import BulkInvoiceJob, InvoiceProcessingItem
from .pipeline import storage

logger = logging.getLogger(__name__)




class OCRStagingView(views.APIView):
    permission_classes = []

    def get(self, request, file_hash=None):
        """
        List all staged invoices for the tenant.
        """
        try:
            if not request.user.is_anonymous:
                tenant_id = str(getattr(request.user, 'tenant_id', getattr(getattr(request.user, 'userprofile', None), 'tenant_id', '88fe4389-58a9-4244-9878-8a4e646898bd')))
            else:
                tenant_id = "88fe4389-58a9-4244-9878-8a4e646898bd"
            # Capture upload_session_id from URL parameter (file_hash) or query/data
            upload_session_id = file_hash or request.query_params.get('upload_session_id') or request.data.get('upload_session_id')
            staged_invoices = get_all_staged_invoices(tenant_id, upload_session_id)
            
            # STEP 8: REMOVE POLLING FAILURE
            from django.utils.dateparse import parse_datetime
            now = timezone.now()
            for inv in staged_invoices:
                status = inv.get('validation_status', 'PENDING')
                if status in {'PENDING', 'processing'}:
                    created_at_str = inv.get('created_at')
                    if created_at_str:
                        created_at = parse_datetime(str(created_at_str))
                        if created_at:
                            now_n = now.replace(tzinfo=None)
                            cat_n = created_at.replace(tzinfo=None)
                            if (now_n - cat_n).total_seconds() > 180:
                                # Stuck > 180s -> mark FAILED
                                from core.ocr_cache import update_ocr_cache_validation_status
                                from vouchers.models import InvoiceProcessingItem
                                update_ocr_cache_validation_status(inv['file_hash'], tenant_id, 'FAILED')
                                inv['validation_status'] = 'FAILED'
                                inv['status'] = 'FAILED'
                                
                                # Update models to prevent PENDING forever
                                items = InvoiceProcessingItem.objects.filter(file_hash=inv['file_hash'])
                                items.update(status='failed')
                                for it in items:
                                    if it.job:
                                        it.job.status = 'failed'
                                        it.job.save()

            results = []
            for inv in staged_invoices:
                try:
                    raw_extracted = inv.get('extracted_data', {})
                    if isinstance(raw_extracted, str):
                        try:
                            extracted = json.loads(raw_extracted)
                        except Exception:
                            extracted = {}
                    else:
                        extracted = raw_extracted if isinstance(raw_extracted, dict) else {}
                    
                    # ENFORCE: Backend MUST use snake_case ONLY
                    # Output the standardized structure directly to frontend
                    results.append({
                        'id': inv.get('id', 0),
                        'file_hash': inv.get('file_hash', ''),
                        'file_path': inv.get('file_path', 'unknown'),
                        'supplier_invoice_no': str(extracted.get('supplier_invoice_no') or ''),
                        'invoice_date': str(extracted.get('invoice_date') or ''),
                        'vendor_name': str(extracted.get('vendor_name') or ''),
                        'gstin': str(extracted.get('gstin') or ''),
                        'total_invoice_value': extracted.get('total_invoice_value') or 0,
                        'line_items': extracted.get('line_items', []),
                        'status': inv.get('validation_status', 'PENDING'),
                        'validation_status': inv.get('validation_status', 'PENDING'),
                        'extracted_data': extracted,
                        'created_at': str(inv.get('created_at', '')),
                        'vendor_id': int(inv.get('vendor_id')) if inv.get('vendor_id') else None,
                        'voucher_id': int(inv.get('voucher_id')) if inv.get('voucher_id') else None,
                    })
                except Exception as row_err:
                    logger.error(f"Error processing staging row {inv.get('id', 'unknown')}: {row_err}")
                    continue

            # Determine overall pipeline status
            # "processing" = at least one row still being worked on
            # "completed"  = all rows have reached a terminal state
            PENDING_STATES = {'PENDING', 'processing', 'PROCESSING'}
            has_pending = any(
                inv.get('validation_status', 'PENDING') in PENDING_STATES
                for inv in staged_invoices
            )
            pipeline_status = 'processing' if has_pending else 'completed'

            return Response({
                'status': pipeline_status,
                'data': results
            })
        except Exception as e:
            import traceback
            logger.error(f"CRITICAL ERROR in OCRStagingView.get: {e}\n{traceback.format_exc()}")
            return Response({'error': 'Internal Server Error', 'detail': str(e)}, status=500)


    # ------------------------------------------------------------------
    # Internal helpers (no OCR / mapping logic touched)
    def _is_pdf(self, uploaded_file) -> bool:
        """Return True if the uploaded file is a PDF based on MIME type or extension."""
        mime = (uploaded_file.content_type or '').lower()
        name = (uploaded_file.name or '').lower()
        return mime == 'application/pdf' or name.endswith('.pdf')

    def _process_single_invoice(
        self,
        request,
        *,
        file_bytes: bytes,
        file_path: str,
        mime_type: str,
        tenant_id: str,
        user_id: str,
        upload_session_id: str,
        all_columns: list,
        voucher_type: str = 'Purchase',
        job_id: int | None = None,
    ) -> bool:
        """
        Extracts invoice data inline via Gemini and updates the DB.
        """
        try:
            file_hash = compute_file_hash(file_bytes)
            
            # 1. Check if already staged (idempotency)
            existing = get_cached_ocr(file_hash, tenant_id)
            if existing:
                # If already fully validated and successfully matched, just reuse it
                valid_ready_states = ['READY', 'DUPLICATE', 'GSTIN_CONFLICT', 'Voucher Created']
                if existing.get('validation_status') in valid_ready_states:
                    update_ocr_cache_session(existing['id'], upload_session_id)
                    return True
                
                # If it has data but is in a "FIXABLE" state (Missing Vendor, Failed but has info), reuse info
                if existing.get('extracted_data'):
                    logger.info("Found existing info for %s, re-validating...", file_path)
                    update_ocr_cache_session(existing['id'], upload_session_id)
                    from core.processing_engine import run_invoice_processing_pipeline
                    run_invoice_processing_pipeline(file_hash, tenant_id, voucher_type=voucher_type)
                    return True

                # If it was truly empty and failed, delete so we can re-extract
                from core.ocr_cache import remove_staged_invoice
                remove_staged_invoice(file_hash, tenant_id)

            # 2. Save to Storage
            storage_key = storage.make_key(job_id or 0, file_path)
            storage.upload_bytes(file_bytes, storage_key)

            # 3. Create initial staging record
            save_ocr_cache(
                file_hash=file_hash,
                tenant_id=tenant_id,
                upload_session_id=upload_session_id,
                file_path=file_path,
                ocr_raw_text="",
                extracted_data={},
                validation_status='PROCESSING',
            )

            # 4. Create Processing Item for Job tracking
            if job_id:
                master = InvoiceProcessingItem.objects.create(
                    job_id=job_id,
                    file_path=storage_key,
                    file_hash=file_hash,
                    status='pending',
                    page_count=1,
                )
                item_id = master.id
            else:
                item_id = None

            # 5. Extract invoice data directly via Gemini
            # Check and increment AI usage (billing/subscription)
            # Default to STARTER limit (100) if plan not found
            plan = getattr(request.user, 'selected_plan', 'FREE') or 'FREE'
            LIMITS = {'FREE': 5, 'STARTER': 100, 'PRO': float('inf')}
            limit = LIMITS.get(plan.upper(), 5)
            
            if not check_and_increment_usage(tenant_id, limit):
                update_ocr_cache_validation_status(file_hash, tenant_id, 'QUOTA_EXCEEDED')
                if item_id:
                    InvoiceProcessingItem.objects.filter(id=item_id).update(status='failed')
                return False

            from vouchers.extraction_logic import perform_ocr_extraction
            print(f"🚀 [GEMINI EXTRACT] Extracting {file_path} via Centralized Logic...")
            raw_extracted_data = perform_ocr_extraction(
                file_bytes, 
                mime_type, 
                hint_data={'columns': all_columns}
            )

            if not raw_extracted_data:
                # Update DB to failed
                from core.ocr_cache import update_ocr_cache_validation_status
                update_ocr_cache_validation_status(file_hash, tenant_id, 'EXTRACTION_FAILED')
                if item_id:
                    InvoiceProcessingItem.objects.filter(id=item_id).update(status='failed')
                return False

            
            # 6. Save extracted data to DB so pipeline can work on it
            from core.ocr_cache import update_staged_invoice_extracted_data
            update_staged_invoice_extracted_data(
                file_hash=file_hash,
                tenant_id=tenant_id,
                extracted_data=raw_extracted_data
            )
                
            # 7. Process and validate the extracted data
            from core.processing_engine import run_invoice_processing_pipeline
            pipeline_res = run_invoice_processing_pipeline(
                file_hash=file_hash, 
                tenant_id=tenant_id,
                voucher_type=voucher_type
            )
            final_status = pipeline_res.get('status', 'VALIDATION_FAILED')
            
            # Update item status if part of a job
            if item_id:
                InvoiceProcessingItem.objects.filter(id=item_id).update(
                    status='success' if final_status in ['READY', 'DUPLICATE', 'GSTIN_CONFLICT', 'VENDOR_MISSING'] else 'failed'
                )

            print(f"✅ [GEMINI EXTRACT] Extracted & Validated: {file_path} -> {final_status}")
            return True

        except Exception as exc:
            import traceback
            print(f"❌ [PIPELINE CRASH] {file_path}: {exc}")
            print(traceback.format_exc())
            logger.exception("Error in pipeline for invoice %s", file_path)
            # IMPORTANT: Always update DB so it doesn't stay PROCESSING forever
            try:
                fh = compute_file_hash(file_bytes)
                from core.ocr_cache import update_ocr_cache_validation_status
                update_ocr_cache_validation_status(fh, tenant_id, 'EXTRACTION_FAILED')
            except Exception:
                pass
            return False

    # Removed _extract_via_gemini in favor of centralized vouchers.extraction_logic.perform_ocr_extraction


    def post(self, request):
        try:
            """
            Bulk Upload & Stage:
            Each upload must include a unique upload_session_id from the frontend.
            """
            files = request.FILES.getlist('files')
            upload_session_id = request.data.get('upload_session_id')
            tenant_id = str(request.user.tenant_id) if not request.user.is_anonymous else "88fe4389-58a9-4244-9878-8a4e646898bd"
            user_id = str(request.user.id) if not request.user.is_anonymous else "42"

            if not upload_session_id:
                return Response({'error': 'upload_session_id is required'}, status=status.HTTP_400_BAD_REQUEST)

            if not files:
                return Response({'error': 'No files uploaded'}, status=status.HTTP_400_BAD_REQUEST)

            # ── DYNAMIC EXTRACTION SCHEMAS ──────────────────────────────
            voucher_type = request.data.get('voucher_type') or request.POST.get('voucher_type') or request.query_params.get('voucher_type') or 'Purchase'
            
            # Map type to schemas (matching what's in mappingEngine.ts)
            schemas = {
                'Purchase': {
                    'headers': [
                        'Date', 'Supplier Invoice No', 'Vendor Name', 'GSTIN',
                        'Bill From - Address Line 1', 'Bill From - City', 'Bill From - State', 
                        'Branch', 'Total Invoice Value', 'Total Taxable Value', 'Place of Supply',
                        'Purchase Order No', 'Reference No', 'Purchase Voucher No',
                        'Total IGST', 'Total CGST', 'Total SGST/UTGST',
                        'IRN', 'Ack. No.', 'Ack. Date'
                    ],
                    'items': [
                        'Item Name', 'HSN/SAC', 'Qty', 'UOM', 'Item Rate',
                        'Taxable Value', 'IGST', 'CGST', 'SGST/UTGST', 'Cess', 'Invoice Value'
                    ]
                },
                'Sales': {
                    'headers': [
                        'Date', 'Invoice No', 'Customer Name', 'GSTIN',
                        'Bill To - Address Line 1', 'Bill To - City', 'Bill To - State', 
                        'Branch', 'Total Invoice Value', 'Total Taxable Value', 'Place of Supply',
                        'Sales Order No', 'Reference No', 'Sales Voucher No',
                        'Total IGST', 'Total CGST', 'Total SGST/UTGST',
                        'IRN', 'Ack. No.', 'Ack. Date'
                    ],
                    'items': [
                        'Item Name', 'HSN/SAC', 'Qty', 'UOM', 'Item Rate',
                        'Taxable Value', 'IGST', 'CGST', 'SGST/UTGST', 'Cess', 'Invoice Value'
                    ]
                },
                'Payment': {
                    'headers': ['Voucher Date', 'Account', 'Party', 'Amount', 'Narration', 'Reference No', 'Bank Name'],
                    'items': []
                },
                'Receipt': {
                    'headers': ['Voucher Date', 'Account', 'Party', 'Amount', 'Narration', 'Reference No', 'Bank Name'],
                    'items': []
                },
                'Contra': {
                    'headers': ['Voucher Date', 'From Account', 'To Account', 'Amount', 'Narration'],
                    'items': []
                },
                'Journal': {
                    'headers': ['Voucher Date', 'Ledger (Debit)', 'Ledger (Credit)', 'Amount', 'Narration'],
                    'items': []
                }
            }

            active_schema = schemas.get(voucher_type, schemas['Purchase'])
            print(f"DEBUG: Using schema for voucher_type: {voucher_type}")
            all_columns = active_schema['headers'] + active_schema['items']

            import concurrent.futures
            import traceback

            # ── GATE 1: System health ────────────────────────────────
            ready, reason = SystemHealth.is_ready()
            if not ready:
                return Response({'error': reason}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            # ── CREATE JOB ───────────────────────────────────
            job = BulkInvoiceJob.objects.create(
                tenant_id=tenant_id,
                upload_session_id=upload_session_id,
                status='processing',
                total_files=0, # Will update
            )

            # ── FLATTEN TASKS ──────────────────────────────
            tasks = []
            for uploaded_file in files:
                try:
                    file_bytes = uploaded_file.read()
                    uploaded_file.seek(0)

                    if self._is_pdf(uploaded_file) and len(file_bytes) > 0:
                        from core.pdf_splitter import split_pdf_into_invoice_files
                        
                        split_results = split_pdf_into_invoice_files(
                            pdf_bytes=file_bytes,
                            original_filename=uploaded_file.name,
                        )
                        
                        for inv_number, tmp_path, group in split_results:
                            try:
                                with open(tmp_path, 'rb') as fh:
                                    split_bytes = fh.read()
                                
                                label = f"{uploaded_file.name} [Inv {inv_number}]" if len(split_results) > 1 else uploaded_file.name
                                tasks.append({
                                    'file_bytes': split_bytes,
                                    'file_path': label,
                                    'mime_type': 'application/pdf',
                                    'tmp_path': tmp_path
                                })
                            except Exception as e:
                                logger.error(f"Error reading split {tmp_path}: {e}")
                                from core.pdf_splitter import cleanup_temp_pdf
                                cleanup_temp_pdf(tmp_path)
                    else:
                        tasks.append({
                            'file_bytes': file_bytes,
                            'file_path': uploaded_file.name,
                            'mime_type': uploaded_file.content_type or 'application/octet-stream',
                            'tmp_path': None
                        })
                except Exception as exc:
                    logger.exception("Error preparing uploaded file %s", uploaded_file.name)

            # Update Job total count
            job.total_files = len(tasks)
            job.save()

            # ── EXECUTE CONCURRENTLY ───────────────────────
            def worker(task):
                from django.db import connection
                try:
                    success = self._process_single_invoice(
                        request,
                        file_bytes=task['file_bytes'],
                        file_path=task['file_path'],
                        mime_type=task['mime_type'],
                        tenant_id=tenant_id,
                        user_id=user_id,
                        upload_session_id=upload_session_id,
                        all_columns=all_columns,
                        voucher_type=voucher_type,
                        job_id=job.id,
                    )
                    return success
                except Exception as e:
                    logger.error(f"Worker exception on {task['file_path']}: {e}\n{traceback.format_exc()}")
                    return False
                finally:
                    if task.get('tmp_path'):
                        from core.pdf_splitter import cleanup_temp_pdf
                        cleanup_temp_pdf(task['tmp_path'])
                    connection.close()

            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                list(executor.map(worker, tasks))

            # Mark job as completed for polling UI
            job.status = 'completed'
            job.save()

            # Return the staged list (might be PENDING)
            response = self.get(request, file_hash=upload_session_id)
            return Response({
                'success': True, 
                'staged': response.data,
                'job_id': job.id
            })
        except Exception as e:
            import traceback
            print(f"🔥 POST CRASH: {e}")
            print(traceback.format_exc())
            return Response({'success': False, 'error': str(e)}, status=500)

    def patch(self, request, file_hash=None):
        """
        Save edited extracted_data for a staged invoice, then auto-revalidate using Purchase validation logic.
        """
        tenant_id = str(request.user.tenant_id)
        if not file_hash:
            return Response({'error': 'file_hash is required'}, status=status.HTTP_400_BAD_REQUEST)

        extracted_data = request.data.get('extracted_data')
        if extracted_data is None:
            return Response({'error': 'extracted_data is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Trigger Re-validation using the shared Mapping Engine and Validator
        try:
            # 1. Re-normalize edited data (handles numeric cleaning, etc)
            # Since the data is already JSON, we just treat it as header/items
            processed_data = parse_and_process_ocr(json.dumps(extracted_data)) # Re-process via engine
            
            # 2. Run Vendor Validation on the normalized data (handle flat structure)
            v_name = processed_data.get('vendor_name') or ''
            v_gstin = processed_data.get('gstin') or ''
            v_branch = processed_data.get('branch') or processed_data.get('branch_name') or ''
            v_address = processed_data.get('bill_from_address_line_1') or processed_data.get('address') or ''
            v_state = processed_data.get('bill_from_state') or ''

            print("Purchase Vendor Validation API Hit (via Staging Patch)")
            print(f"Revalidating with credentials - Name: {v_name}, GSTIN: {v_gstin}, Branch: {v_branch}")

            # Field validation
            inv_no = processed_data.get('supplier_invoice_no') or processed_data.get('Supplier Invoice No') or \
                     processed_data.get('invoice_number') or ''

            val_result = validate_vendor(
                tenant_id=tenant_id,
                vendor_name=v_name,
                gstin=v_gstin,
                branch=v_branch,
                address=v_address,
                state=v_state,
                supplier_invoice_no=inv_no
            )
                     
            taxable_val = processed_data.get('total_taxable_value') or processed_data.get('Total Taxable Value') or ''
            grand_total = processed_data.get('total_invoice_value') or processed_data.get('Total Invoice Value') or ''
            
            fields_valid = bool(v_name and v_gstin and inv_no and (taxable_val or grand_total))
            vendor_status_raw = val_result.get('status')
            
            # 3. Save to DB
            # User specifically asked to bypass duplicate check during manual resolution
            if vendor_status_raw == 'DUPLICATE_INVOICE':
                final_status = 'READY' # Allow user to proceed even if duplicate
                conflict_msg = val_result.get('message', 'Duplicate invoice detected (Proceeding as per user request).')
            elif vendor_status_raw == 'GSTIN_CONFLICT':
                final_status = 'GSTIN_CONFLICT'
                conflict_msg = val_result.get('message', 'GSTIN Conflict detected.')
            elif vendor_status_raw != 'FOUND':
                final_status = 'VENDOR_MISSING'
                conflict_msg = val_result.get('message', 'Vendor not found in master.')
            elif not fields_valid:
                final_status = 'VALIDATION_FAILED'
                conflict_msg = f'Missing required fields (Found: V={bool(v_name)}, G={bool(v_gstin)}, I={bool(inv_no)}, T={bool(taxable_val or grand_total)}).'
            else:
                final_status = 'READY'
                conflict_msg = None

            success = update_staged_invoice_extracted_data(
                file_hash=file_hash,
                tenant_id=tenant_id,
                extracted_data=processed_data, # Save the normalized version
                validation_status=final_status,
                matched_by=val_result.get('matched_by'),
                conflict_message=conflict_msg,
                vendor_id=val_result.get('vendor_id')
            )
        except Exception as e:
            logger.error(f"Error in manual edit processing: {e}")
            return Response({'error': 'Failed to process edited data'}, status=500)

        if not success:
            return Response({'error': 'Invoice not found or already processed'}, status=status.HTTP_404_NOT_FOUND)

        # Return updated info so UI can refresh
        return Response({
            'success': True,
            'file_hash': file_hash,
            'extracted_data': processed_data,
            'status': final_status,
            'vendor_id': val_result.get('vendor_id'),
            'vendor_name': val_result.get('vendor_name'),
        })

    def delete(self, request, file_hash=None):
        """
        Remove a specific invoice from staging.
        """
        tenant_id = str(request.user.tenant_id)
        if not file_hash:
            return Response({'error': 'file_hash is required'}, status=400)
            
        success = remove_staged_invoice(file_hash, tenant_id)
        if success:
            return Response({'success': True})
        return Response({'error': 'Record not found or already deleted'}, status=404)

class OCRStagingFinalizeView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Convert valid staged invoices into vouchers.
        Only processes records with validation_status = 'READY'.
        """
        tenant_id = str(request.user.tenant_id)
        upload_session_id = request.data.get('upload_session_id')
        
        # Load all staged invoices
        all_staged = get_all_staged_invoices(tenant_id, upload_session_id)
        
        # Filter: ONLY process 'READY' and not processed
        ready_to_upload = [
            inv for inv in all_staged 
            if inv.get('validation_status') == 'READY'
            and not inv.get('processed', False)
        ]

        if not ready_to_upload:
            return Response({'error': 'No invoices with status "READY" to finalize.'}, status=status.HTTP_400_BAD_REQUEST)

        summary = {
            'total': len(ready_to_upload),
            'created': 0,
            'failed': 0,
            'skipped': len(all_staged) - len(ready_to_upload), # Invoices not 'FOUND' or 'RESOLVED'
            'errors': [],
            'message': '' # Initialize to help Pyre inference
        }
        
        processed_hashes = []

        for inv in ready_to_upload:
            try:
                # ── Step 1: Normalize Extracted Data ──────────────────────────
                raw_extracted = inv.get('extracted_data', {})
                if isinstance(raw_extracted, str):
                    try:
                        extracted = json.loads(raw_extracted)
                    except:
                        extracted = {}
                else:
                    extracted = raw_extracted if isinstance(raw_extracted, dict) else {}
                
                # Support both {invoice, items} and {header, line_items} or flat
                invoice_data = extracted.get('invoice', extracted.get('header', extracted))
                if isinstance(invoice_data, list) and invoice_data:
                    invoice_data = invoice_data[0]
                if not isinstance(invoice_data, dict):
                    invoice_data = {}
                
                items = extracted.get('items', extracted.get('line_items', []))

                # ── Step 2: Resolve Vendor Identity ───────────────────────────
                vendor_id = inv.get('vendor_id')
                vendor_name_final = invoice_data.get('vendor_name') or invoice_data.get('Vendor Name')
                gstin_final = invoice_data.get('gstin') or invoice_data.get('GSTIN')

                # ── Step 3: Map & Create Purchase Voucher ──────────────────────
                payload = {
                    'date': self._parse_date(invoice_data.get('invoice_date')),
                    'supplier_invoice_no': invoice_data.get('supplier_invoice_no') or invoice_data.get('invoice_no'),
                    'vendor_id': vendor_id,
                    'vendor_name': vendor_name_final,
                    'gstin': gstin_final,
                    'total_invoice_value': invoice_data.get('total_invoice_value'),
                    'supply_inr_details': {
                        'items': [
                            {
                                'item_name': item.get('description', 'Item'),
                                'qty': item.get('quantity', 0),
                                'rate': item.get('rate', 0),
                                'taxableValue': item.get('amount', item.get('taxable_value', 0)),
                                'hsn_sac': item.get('hsn_sac', ''),
                                'cgst': item.get('cgst', 0),
                                'sgst': item.get('sgst', 0),
                                'igst': item.get('igst', 0),
                            } for item in (items or [])
                        ],
                        'description': f"Created from AI Smart Upload: {inv['file_path']}"
                    },
                    'due_details': {
                        'to_pay': invoice_data.get('total_invoice_value', 0)
                    }
                }

                with transaction.atomic():
                    # Check for duplicates before attempting to save
                    from accounting.models import Voucher
                    voucher_num = payload.get('supplier_invoice_no')
                    if voucher_num and Voucher.objects.filter(voucher_number=voucher_num, tenant_id=tenant_id, type='purchase').exists():
                        raise Exception(f"Duplicate Invoice Number: {voucher_num} already exists for this tenant.")

                    serializer = VoucherPurchaseSupplierDetailsSerializer(data=payload, context={'request': request})
                    if serializer.is_valid():
                        voucher = serializer.save(tenant_id=tenant_id)
                        summary['created'] = int(summary['created']) + 1 # pyre-ignore
                        processed_hashes.append(inv['file_hash'])
                        # Mark as processed in DB and store the voucher reference
                        mark_invoice_as_processed(inv['file_hash'], tenant_id, voucher_id=voucher.id)
                    else:
                        summary['failed'] = int(summary['failed']) + 1 # pyre-ignore
                        summary['errors'].append({'file': inv['file_path'], 'error': serializer.errors})

            except Exception as e:
                logger.exception(f"Exception finalising {inv['file_path']}")
                summary['failed'] = int(summary['failed']) + 1 # pyre-ignore
                summary['errors'].append({'file': inv['file_path'], 'error': str(e)})

        # Delete processed invoices from staging once finalized into ERP
        if processed_hashes:
            from core.ocr_cache import remove_processed_invoices
            remove_processed_invoices(processed_hashes, tenant_id, upload_session_id)

        # ── Step 5: User Message ──────────────────────────────────────────────
        total_unresolved = int(summary['skipped']) + int(summary['failed']) # pyre-ignore
        if int(summary['created']) > 0: # pyre-ignore
            msg = f"{summary['created']} invoices successfully uploaded."
            if total_unresolved > 0:
                msg += f" {total_unresolved} invoices require correction and remain in staging."
            summary['message'] = msg
        elif total_unresolved > 0:
            summary['message'] = f"No invoices could be finalized. {total_unresolved} invoices remain in staging."

        return Response(summary)

    def _parse_date(self, date_str):
        if not date_str: return None
        try:
            from datetime import datetime
            if '/' in date_str:
                return datetime.strptime(date_str, '%d/%m/%Y').strftime('%Y-%m-%d')
            return date_str
        except: return None

    def _map_items(self, items):
        mapped = []
        for item in items:
            mapped.append({
                'item_name': item.get('Item Name') or item.get('Item') or '—',
                'item_code': item.get('Item Code') or '',
                'hsn_sac': item.get('HSN/SAC') or '',
                'qty': self._to_float(item.get('Quantity') or item.get('Qty')),
                'uom': item.get('UOM') or '',
                'rate': self._to_float(item.get('Rate')),
                'taxable_value': self._to_float(item.get('Taxable Value') or item.get('Amount')),
                'igst': self._to_float(item.get('IGST')),
                'cgst': self._to_float(item.get('CGST')),
                'sgst': self._to_float(item.get('SGST/UTGST') or item.get('SGST')),
                'cess': self._to_float(item.get('Cess')),
                'invoice_value': self._to_float(item.get('Invoice Value') or item.get('Item Amount'))
            })
        return mapped

    def _to_float(self, val):
        if val is None or val == '': return 0.0
        try:
            if isinstance(val, str):
                val = val.replace(',', '').replace('₹', '').strip()
            return float(val)
        except: return 0.0
