import uuid
import io
import json
from django.core.cache import cache
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from core.ai_service import create_dynamic_voucher_extraction_request
from core.ai_proxy import api_key_manager
from vendors.models import VendorMasterBasicDetail, VendorMasterGSTDetails
from accounting.serializers_voucher_purchase import VoucherPurchaseSupplierDetailsSerializer
from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails

class BulkScanAPIView(APIView):
    permission_classes = [IsAuthenticated]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _is_pdf(self, uploaded_file) -> bool:
        """Return True if the uploaded file is a PDF."""
        mime = (uploaded_file.content_type or '').lower()
        name = (uploaded_file.name or '').lower()
        return mime == 'application/pdf' or name.endswith('.pdf')

    def _run_ocr_and_detect_vendor(
        self,
        *,
        file_bytes: bytes,
        file_name: str,
        mime_type: str,
        voucher_type: str,
        all_columns: list,
        tenant_id,
        user_id,
        upload_session_id: str,
    ) -> dict:
        """
        Existing OCR + cache + vendor-detection logic extracted into a helper
        so it can be called once per detected invoice (whether split or not).

        The vendor matching code and caching logic are IDENTICAL to the
        original implementation — nothing is modified, only refactored.
        """
        import logging as _logging
        import re as _re
        _bulk_logger = _logging.getLogger(__name__)

        # SHA-256 hash for cache deduplication
        from core.ocr_cache import compute_file_hash
        file_hash = compute_file_hash(file_bytes)

        # ── Call AI Service ──────────────────────────────────────────────
        extraction_res = create_dynamic_voucher_extraction_request(
            image_file=io.BytesIO(file_bytes),
            voucher_type=voucher_type,
            table_name='purchase_vouchers',
            columns=all_columns,
            mime_type=mime_type,
            user_id=str(user_id),
            tenant_id=tenant_id,
            upload_session_id=upload_session_id
        )

        if 'error' in extraction_res:
            return {
                'file_name': file_name,
                'vendor_status': 'ERROR',
                'error': extraction_res['error'],
            }

        # ── Run the Processing Pipeline (Normalization + Validation + Cache Update) ──
        from core.processing_engine import run_invoice_processing_pipeline
        pipeline_res = run_invoice_processing_pipeline(file_hash, tenant_id, voucher_type=voucher_type)

        if not pipeline_res:
            return {
                'file_name': file_name,
                'vendor_status': 'ERROR',
                'error': 'Pipeline processing failed',
            }

        extracted_data = pipeline_res['extracted_data']
        invoice_header = extracted_data.get('invoice', {})
        v_status = pipeline_res['status']
        v_id = pipeline_res.get('vendor_id')

        return {
            'file_name': file_name,
            'file_hash': file_hash,
            'vendor_status': 'FOUND' if v_status in ['READY', 'FOUND', 'RESOLVED'] else 'MISSING',
            'vendor_id': v_id,
            'vendor_name': invoice_header.get('Vendor Name') or invoice_header.get('vendor_name'),
            'gstin': invoice_header.get('GSTIN') or invoice_header.get('vendor_gstin'),
            'invoice_number': invoice_header.get('Supplier Invoice No') or invoice_header.get('invoice_number'),
            'invoice_date': invoice_header.get('Voucher Date') or invoice_header.get('invoice_date'),
            'total_amount': invoice_header.get('Total Invoice Value') or invoice_header.get('Grand Total') or invoice_header.get('total_amount'),
            'address': invoice_header.get('Bill From - Address Line 1', ''),
            'state': invoice_header.get('Bill From - State', ''),
            'branch': invoice_header.get('Branch', ''),
            'extracted_data': extracted_data,
            'status': v_status,
            'from_cache': extraction_res.get('from_cache', False),
            'cache_record_id': extraction_res.get('cache_record_id'),
        }

    def post(self, request):
        import threading
        try: # Step 6: Catch Full Failure
            files = request.FILES.getlist('files')
            # Step 1: Add Debug Logs
            print("FILES RECEIVED:", len(files))

            # Step 4: Limit Batch Size
            if len(files) > 5:
                return Response({"error": "Too many files. Max 5 allowed."}, status=status.HTTP_400_BAD_REQUEST)

            voucher_type = request.data.get('voucher_type', 'Purchase')
            upload_session_id = request.data.get('upload_session_id')
            tenant_id = request.user.tenant_id
            user_id = request.user.id

            if not files:
                return Response({'error': 'No files uploaded'}, status=status.HTTP_400_BAD_REQUEST)

            if not upload_session_id:
                return Response({'error': 'upload_session_id is required'}, status=status.HTTP_400_BAD_REQUEST)

            scan_id = str(uuid.uuid4())
            
            # Prepare files for background processing (read into memory)
            files_data = []
            for f in files:
                # Step 5: Add Safe Guard
                if not f:
                    continue
                f.seek(0)
                content = f.read()
                if not content:
                    continue
                files_data.append({
                    'name': f.name,
                    'content': content,
                    'content_type': f.content_type
                })

            # Parameters for the background task
            # Columns for extraction (moved from post to be accessible in task)
            HEADER_FIELDS = [
                'Voucher Date', 'Supplier Invoice No', 'Vendor Name', 'GSTIN',
                'Bill From - Address Line 1', 'Place of Supply', 'Grand Total',
                'Subtotal', 'Bill From - City', 'Bill From - State', 'Branch'
            ]
            LINE_ITEM_FIELDS = [
                'Item Name', 'HSN/SAC', 'Qty', 'UOM', 'Item Rate',
                'Taxable Value', 'Invoice Value', 'IGST', 'CGST', 'SGST/UTGST', 'Cess'
            ]
            all_columns = HEADER_FIELDS + LINE_ITEM_FIELDS

            # Step 3: Prevent Blocking (Return immediate response)
            def _background_task():
                results_map = {}
                for file_info in files_data:
                    file_name = file_info['name']
                    # Step 1: Add Debug Logs
                    print("Processing file:", file_name)
                    
                    try:
                        # Step 2: Add Timeout/Error Handling wrapper
                        # (The timeout itself is now in core/ai_proxy.py)
                        file_bytes = file_info['content']
                        
                        # ── MULTI-INVOICE PDF SPLITTING (preprocessing layer) ────────
                        if (file_info['content_type'] == 'application/pdf' or file_name.lower().endswith('.pdf')) and len(file_bytes) > 0:
                            from core.pdf_splitter import split_pdf_into_invoice_files, cleanup_temp_pdf

                            split_results = split_pdf_into_invoice_files(
                                pdf_bytes=file_bytes,
                                original_filename=file_name,
                            )

                            for inv_number, tmp_path, group in split_results:
                                try:
                                    with open(tmp_path, 'rb') as fh:
                                        split_bytes = fh.read()

                                    # Give a unique descriptive name when multi-invoice
                                    if len(split_results) > 1:
                                        inv_label = f"{file_name} [Inv {inv_number}]"
                                    else:
                                        inv_label = file_name

                                    result = self._run_ocr_and_detect_vendor(
                                        file_bytes=split_bytes,
                                        file_name=inv_label,
                                        mime_type='application/pdf',
                                        voucher_type=voucher_type,
                                        all_columns=all_columns,
                                        tenant_id=tenant_id,
                                        user_id=user_id,
                                        upload_session_id=upload_session_id,
                                    )
                                    results_map[inv_label] = result
                                    print("Completed file") # Step 1 log
                                except Exception as split_exc:
                                    print("AI ERROR:", str(split_exc)) # Step 2 log
                                    results_map[f"{file_name} [Inv {inv_number}]"] = {
                                        'file_name': f"{file_name} [Inv {inv_number}]",
                                        'vendor_status': 'ERROR',
                                        'error': str(split_exc),
                                    }
                                finally:
                                    cleanup_temp_pdf(tmp_path)
                        else:
                            # ── Non-PDF (images) ──
                            result = self._run_ocr_and_detect_vendor(
                                file_bytes=file_bytes,
                                file_name=file_name,
                                mime_type=file_info['content_type'] or 'application/octet-stream',
                                voucher_type=voucher_type,
                                all_columns=all_columns,
                                tenant_id=tenant_id,
                                user_id=user_id,
                                upload_session_id=upload_session_id,
                            )
                            results_map[file_name] = result
                            print("Completed file") # Step 1 log

                    except Exception as e:
                        print("AI ERROR:", str(e)) # Step 2 log
                        results_map[file_name] = {
                            'file_name': file_name,
                            'vendor_status': 'ERROR',
                            'error': str(e)
                        }
                        continue # Step 2 requirement

                # Save all results to cache so Finalize API can pick them up
                cache_key = f"scan_{scan_id}"
                cache.set(cache_key, {
                    'tenant_id': tenant_id,
                    'data': results_map
                }, timeout=3600)
                # Final log as requested
                print("Completed batch")

            threading.Thread(target=_background_task).start()

            return Response({
                "status": "processing_started",
                "scan_id": scan_id,
                "files": len(files_data)
            })

        except Exception as e:
            return Response({
                "error": str(e)
            }, status=500)

class BulkScanUpdateVendorAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        scan_id = request.data.get('scan_id')
        file_name = request.data.get('file_name')
        vendor_id = request.data.get('vendor_id')

        cache_key = f"scan_{scan_id}"
        cached_batch = cache.get(cache_key)

        if not cached_batch:
            return Response({'error': 'Scan session expired or not found'}, status=status.HTTP_404_NOT_FOUND)

        if file_name not in cached_batch['data']:
            return Response({'error': 'File not found in scan session'}, status=status.HTTP_404_NOT_FOUND)

        # Ensure vendor exists
        try:
            vendor = VendorMasterBasicDetail.objects.get(id=vendor_id, tenant_id=request.user.tenant_id)
        except VendorMasterBasicDetail.DoesNotExist:
            return Response({'error': 'Vendor not found'}, status=status.HTTP_404_NOT_FOUND)

        # Update cache
        cached_batch['data'][file_name]['vendor_id'] = vendor.id
        cached_batch['data'][file_name]['vendor_status'] = 'RESOLVED'
        cache.set(cache_key, cached_batch, timeout=3600)

        return Response({'success': True, 'vendor_status': 'RESOLVED'})

class BulkScanFinalizeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        scan_id = request.data.get('scan_id')
        tenant_id = request.user.tenant_id

        cache_key = f"scan_{scan_id}"
        cached_batch = cache.get(cache_key)

        if not cached_batch:
            return Response({'error': 'Scan session expired or not found'}, status=status.HTTP_404_NOT_FOUND)

        if cached_batch['tenant_id'] != tenant_id:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        summary = {
            'total': len(cached_batch['data']),
            'created': 0,
            'failed': 0,
            'errors': {}
        }

        for file_name, info in cached_batch['data'].items():
            if info['vendor_status'] not in ['FOUND', 'RESOLVED']:
                summary['failed'] += 1
                summary['errors'][file_name] = f"Vendor status is {info['vendor_status']}"
                continue

            try:
                with transaction.atomic():
                    # Map extracted data to Serializer format
                    extracted = info['extracted_data'].get('data', {})
                    
                    # Prepare the data for VoucherPurchaseSupplierDetailsSerializer
                    payload = {
                        'date': self._parse_date(extracted.get('Date')),
                        'supplier_invoice_no': extracted.get('Supplier Invoice No.'),
                        'vendor_id': info['vendor_id'],
                        'vendor_name': extracted.get('Vendor Name'),
                        'branch': extracted.get('Branch'),
                        'gstin': extracted.get('GSTIN'),
                        'bill_from': extracted.get('Bill From - Address Line 1'),
                        'place_of_supply': extracted.get('Place of Supply'),
                        'supply_inr_details': {
                            'items': self._map_items(extracted.get('items', [])),
                            'description': f"Bulk upload from {file_name}"
                        }
                    }

                    serializer = VoucherPurchaseSupplierDetailsSerializer(data=payload, context={'request': request})
                    if serializer.is_valid():
                        serializer.save(tenant_id=tenant_id)
                        summary['created'] += 1
                    else:
                        summary['failed'] += 1
                        summary['errors'][file_name] = serializer.errors

            except Exception as e:
                summary['failed'] += 1
                summary['errors'][file_name] = str(e)

        # Delete cache after processing
        cache.delete(cache_key)

        return Response(summary)

    def _parse_date(self, date_str):
        if not date_str:
            return None
        # AI returns DD/MM/YYYY, Django expects YYYY-MM-DD
        try:
            from datetime import datetime
            return datetime.strptime(date_str, '%d/%m/%Y').strftime('%Y-%m-%d')
        except:
            return None

    def _map_items(self, items):
        mapped = []
        for item in items:
            mapped.append({
                'item_name': item.get('Item Name'),
                'hsn_sac': item.get('HSN/SAC'),
                'qty': item.get('Qty'),
                'uom': item.get('UOM'),
                'rate': item.get('Item Rate'),
                'taxable_value': item.get('Taxable Value'),
                'invoice_value': item.get('Invoice Value'),
                'igst': item.get('IGST'),
                'cgst': item.get('CGST'),
                'sgst': item.get('SGST/UTGST'),
                'cess': item.get('Cess')
            })
        return mapped
