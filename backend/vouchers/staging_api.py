from rest_framework import views, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.utils import timezone
import logging
import json
import os
import io

from core.ocr_cache import (
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
from core.ai_service import create_dynamic_voucher_extraction_request
from core.usage_service import check_and_increment_usage
from vendors.models import VendorMasterBasicDetail, VendorMasterGSTDetails
from vendors.vendor_validation_logic import validate_vendor
from core.processing_engine import run_invoice_processing_pipeline, parse_and_process_ocr
from accounting.serializers_voucher_purchase import VoucherPurchaseSupplierDetailsSerializer

logger = logging.getLogger(__name__)




class OCRStagingView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        List all staged invoices for the tenant.
        """
        tenant_id = str(request.user.tenant_id)
        # Check query_params (standard GET) or request.data (internal call from POST)
        upload_session_id = request.query_params.get('upload_session_id') or request.data.get('upload_session_id')
        staged_invoices = get_all_staged_invoices(tenant_id, upload_session_id)
        
        results = []
        for inv in staged_invoices:
            extracted = inv.get('extracted_data', {})
            
            # Support both {invoice, items} and {header, items} or flat
            invoice_data = extracted.get('invoice', extracted.get('header', extracted))
            if isinstance(invoice_data, list) and invoice_data:
                invoice_data = invoice_data[0]
            if not isinstance(invoice_data, dict):
                invoice_data = {}
            
            vendor_name = invoice_data.get('Vendor Name') or invoice_data.get('vendor_name') or '—'
            gstin = invoice_data.get('GSTIN') or invoice_data.get('vendor_gstin') or ''
            
            # Map items
            items = extracted.get('items', extracted.get('line_items', []))
            
            # Map flat keys for frontend
            ext_mapped = {
                'invoice_number': invoice_data.get('Supplier Invoice No') or invoice_data.get('invoice_number') or '—',
                'invoice_date': invoice_data.get('Voucher Date') or invoice_data.get('invoice_date') or '—',
                'vendor_name': vendor_name,
                'vendor_gstin': gstin or '—',
                'total_amount': (
                    invoice_data.get('Total Invoice Value')
                    or invoice_data.get('Grand Total')
                    or invoice_data.get('total_amount')
                    or '—'
                ),
                'items': items
            }

            results.append({
                'id': inv['id'],
                'file_hash': inv['file_hash'],
                'file_path': inv['file_path'],
                'invoice_number': ext_mapped['invoice_number'],
                'invoice_date': ext_mapped['invoice_date'],
                'vendor_name': vendor_name,
                'vendor_gstin': gstin or '—',
                'total_amount': ext_mapped['total_amount'],
                'status': inv.get('validation_status', 'PENDING'), # Use stored status
                'validation_status': inv.get('validation_status', 'PENDING'), # Explicitly for new UI
                'extracted_data': extracted,
                'created_at': inv['created_at'],
                'vendor_id': inv.get('vendor_id'),
                'voucher_id': inv.get('voucher_id'),
            })

        return Response(results)

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
    ) -> bool:
        """
        Returns True if the invoice was a duplicate (cached).
        """
        import re as _re
        file_hash = None
        try:
            file_hash = compute_file_hash(file_bytes)

            file_like = io.BytesIO(file_bytes)
            file_like.name = file_path
            file_like.content_type = mime_type

            # ── Call AI Service ──────────────────────────────────────────────
            # Caching and duplicate check are now handled internally.
            extraction_res = create_dynamic_voucher_extraction_request(
                image_file=file_like,
                voucher_type='Purchase',
                table_name='purchase_vouchers',
                columns=all_columns,
                mime_type=mime_type,
                user_id=user_id,
                tenant_id=tenant_id,
                upload_session_id=upload_session_id
            )

            is_duplicate = extraction_res.get('duplicate', False)

            if 'error' in extraction_res:
                logger.error("OCR error for %s: %s", file_path, extraction_res['error'])
                if file_hash:
                    save_ocr_cache(
                        file_hash=file_hash,
                        tenant_id=tenant_id,
                        upload_session_id=upload_session_id,
                        file_path=file_path,
                        ocr_raw_text=extraction_res.get('reply', ''),
                        extracted_data={},
                        validation_status='EXTRACTION_FAILED',
                    )
                return False

            # Run the processing pipeline to update validation status
            run_invoice_processing_pipeline(file_hash, tenant_id)
            
            return is_duplicate

        except json.JSONDecodeError as json_err:
            logger.error("JSON parse error for %s: %s", file_path, json_err)
            if file_hash:
                save_ocr_cache(
                    file_hash=file_hash,
                    tenant_id=tenant_id,
                    upload_session_id=upload_session_id,
                    file_path=file_path,
                    ocr_raw_text=raw_text or '',
                    extracted_data={},
                    validation_status='EXTRACTION_FAILED',
                )
        except Exception as exc:
            logger.exception("Error processing invoice %s", file_path)
            if file_hash:
                save_ocr_cache(
                    file_hash=file_hash,
                    tenant_id=tenant_id,
                    upload_session_id=upload_session_id,
                    file_path=file_path,
                    ocr_raw_text=raw_text or '',
                    extracted_data={},
                    validation_status='EXTRACTION_FAILED',
                )

    def post(self, request):
        """
        Bulk Upload & Stage:
        Each upload must include a unique upload_session_id from the frontend.

        NEW (multi-invoice PDF support):
        If a PDF contains multiple invoices, the system automatically:
          1. Detects invoice boundaries (by invoice number regex).
          2. Splits the PDF into per-invoice temp files.
          3. Runs the existing OCR pipeline for each split invoice.
          4. Creates one staging row per detected invoice.
        Single-page PDFs / images pass through unchanged.
        """
        files = request.FILES.getlist('files')
        upload_session_id = request.data.get('upload_session_id')
        tenant_id = str(request.user.tenant_id)
        user_id = str(request.user.id)

        if not upload_session_id:
            return Response({'error': 'upload_session_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not files:
            return Response({'error': 'No files uploaded'}, status=status.HTTP_400_BAD_REQUEST)

        # Columns for extraction (existing, unchanged)
        HEADER_FIELDS = [
            'Voucher Date', 'Supplier Invoice No', 'Vendor Name', 'GSTIN',
            'Bill From - Address Line 1', 'Place of Supply', 'Total Invoice Value',
            'Total Taxable Value', 'Bill From - City', 'Bill From - State', 'Branch'
        ]
        LINE_ITEM_FIELDS = [
            'Item Name', 'HSN/SAC', 'Quantity', 'UOM', 'Rate',
            'Taxable Value', 'Item Amount', 'IGST', 'CGST', 'SGST/UTGST', 'Cess'
        ]
        all_columns = HEADER_FIELDS + LINE_ITEM_FIELDS

        import concurrent.futures
        import traceback

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

        # ── EXECUTE CONCURRENTLY ───────────────────────
        def worker(task):
            from django.db import connection
            try:
                is_dup = self._process_single_invoice(
                    request,
                    file_bytes=task['file_bytes'],
                    file_path=task['file_path'],
                    mime_type=task['mime_type'],
                    tenant_id=tenant_id,
                    user_id=user_id,
                    upload_session_id=upload_session_id,
                    all_columns=all_columns,
                )
                return is_dup
            except Exception as e:
                logger.error(f"Worker exception on {task['file_path']}: {e}\n{traceback.format_exc()}")
                return False
            finally:
                if task.get('tmp_path'):
                    from core.pdf_splitter import cleanup_temp_pdf
                    cleanup_temp_pdf(task['tmp_path'])
                connection.close()

        duplicate_count = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            results = list(executor.map(worker, tasks))
            duplicate_count = sum(1 for is_dup in results if is_dup)

        # Return the fresh staged list so the frontend can go straight to Review
        response = self.get(request)
        if isinstance(response.data, list):
            return Response({
                'success': True, 
                'staged': response.data,
                'duplicate_count': duplicate_count
            })
        return response

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
            
            # 2. Run Vendor Validation on the normalized data
            invoice_header = processed_data.get('invoice', {})
            v_name = invoice_header.get('Vendor Name') or invoice_header.get('vendor_name') or ''
            v_gstin = invoice_header.get('GSTIN') or invoice_header.get('vendor_gstin') or ''
            v_branch = invoice_header.get('Branch') or invoice_header.get('branch_name') or ''
            v_address = invoice_header.get('Bill From - Address Line 1') or invoice_header.get('vendor_address') or ''
            v_state = invoice_header.get('Bill From - State') or ''

            print("Purchase Vendor Validation API Hit (via Staging Patch)")
            print(f"Revalidating with credentials - Name: {v_name}, GSTIN: {v_gstin}, Branch: {v_branch}")

            val_result = validate_vendor(
                tenant_id=tenant_id,
                vendor_name=v_name,
                gstin=v_gstin,
                branch=v_branch,
                address=v_address,
                state=v_state
            )

            # Field validation - support multiple variants of keys
            inv_no = invoice_header.get('Supplier Invoice No') or invoice_header.get('Supplier Invoice No.') or \
                     invoice_header.get('invoice_number') or ''
                     
            taxable_val = invoice_header.get('Total Taxable Value') or invoice_header.get('Taxable Value') or \
                          invoice_header.get('taxable_value') or ''
                          
            grand_total = invoice_header.get('Total Invoice Value') or invoice_header.get('Invoice Value') or \
                          invoice_header.get('Grand Total') or invoice_header.get('total_amount') or ''
            
            fields_valid = bool(v_name and v_gstin and inv_no and taxable_val and grand_total)
            vendor_status_raw = val_result.get('status')
            
            if vendor_status_raw == 'GSTIN_CONFLICT':
                final_status = 'GSTIN_CONFLICT'
                conflict_msg = val_result.get('message', 'GSTIN Conflict detected.')
            elif vendor_status_raw != 'FOUND':
                final_status = 'VENDOR_MISSING'
                conflict_msg = val_result.get('message', 'Vendor not found in master.')
            elif not fields_valid:
                final_status = 'VALIDATION_FAILED'
                conflict_msg = 'Missing required fields (Vendor, GSTIN, Invoice No, Taxable Value, or Grand Total).'
            else:
                final_status = 'READY'
                conflict_msg = None

            # 3. Save to DB
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
            'errors': []
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

                # ── Step 2: Validate Vendor (Trigger Validation Hub) ───────────
                v_name = invoice_data.get('Vendor Name') or invoice_data.get('vendor_name') or ''
                v_gstin = invoice_data.get('GSTIN') or invoice_data.get('vendor_gstin') or ''
                v_branch = invoice_data.get('Branch') or invoice_data.get('branch_name') or ''
                v_address = invoice_data.get('Bill From - Address Line 1') or invoice_data.get('vendor_address') or ''
                v_state = invoice_data.get('Bill From - State') or ''

                val_result = validate_vendor(
                    tenant_id=tenant_id,
                    vendor_name=v_name,
                    gstin=v_gstin,
                    branch=v_branch,
                    address=v_address,
                    state=v_state
                )
                
                vendor_id = val_result.get('vendor_id')
                # Use validated metadata if found, else original
                vendor_name_final = val_result.get('vendor_name') or v_name
                gstin_final = val_result.get('gstin') or v_gstin

                # ── Step 3: Map & Create Purchase Voucher ──────────────────────
                payload = {
                    'date': self._parse_date(invoice_data.get('Voucher Date') or invoice_data.get('invoice_date')),
                    'supplier_invoice_no': invoice_data.get('Supplier Invoice No') or invoice_data.get('invoice_number'),
                    'vendor_id': vendor_id,
                    'vendor_name': vendor_name_final,
                    'branch': v_branch or "Main Branch",
                    'gstin': gstin_final,
                    'bill_from': v_address,
                    'place_of_supply': v_state or invoice_data.get('Place of Supply'),
                    'supply_inr_details': {
                        'items': self._map_items(items),
                        'description': f"Created from AI Smart Upload: {inv['file_path']}"
                    }
                }

                with transaction.atomic():
                    serializer = VoucherPurchaseSupplierDetailsSerializer(data=payload, context={'request': request})
                    if serializer.is_valid():
                        voucher = serializer.save(tenant_id=tenant_id)
                        summary['created'] += 1
                        processed_hashes.append(inv['file_hash'])
                        # Mark as processed in DB and store the voucher reference
                        mark_invoice_as_processed(inv['file_hash'], tenant_id, voucher_id=voucher.id)
                    else:
                        summary['failed'] += 1
                        summary['errors'].append({'file': inv['file_path'], 'error': serializer.errors})

            except Exception as e:
                logger.exception(f"Exception finalising {inv['file_path']}")
                summary['failed'] += 1
                summary['errors'].append({'file': inv['file_path'], 'error': str(e)})

        # No longer deleting processed invoices instantly, to support status progression
        # if processed_hashes:
        #    remove_processed_invoices(processed_hashes, tenant_id, upload_session_id)

        # ── Step 5: User Message ──────────────────────────────────────────────
        total_unresolved = summary['skipped'] + summary['failed']
        if summary['created'] > 0:
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
