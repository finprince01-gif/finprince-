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

        # ── Call AI Service ──────────────────────────────────────────────
        # This now handles its own internal caching/duplicate check.
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

        _from_cache = extraction_res.get('from_cache', False)
        _cache_record_id = extraction_res.get('cache_record_id')
        raw_text = extraction_res.get('reply', '').strip()

        if raw_text.startswith('```'):
            match = _re.search(r'\{[\s\S]*\}', raw_text)
            if match:
                raw_text = match.group(0)

        try:
            extracted_data = json.loads(raw_text)
        except json.JSONDecodeError:
            match = _re.search(r'\{[\s\S]*\}', raw_text)
            if match:
                extracted_data = json.loads(match.group(0))
            else:
                raise ValueError("Failed to parse AI response as JSON")

        # ── Parse invoice data ───────────────────────────────────────────────
        if extracted_data:
            invoice_data = extracted_data.get('invoice',
                extracted_data.get('header',
                    extracted_data.get('data', extracted_data)
                )
            )
            if isinstance(invoice_data, list):
                invoice_data = invoice_data[0] if invoice_data else {}
            if not isinstance(invoice_data, dict):
                invoice_data = {}
        else:
            invoice_data = {}

        # ── Vendor Detection (unchanged logic) ───────────────────────────────
        vendor_name = (invoice_data.get('Vendor Name') or '').strip()
        gstin = (invoice_data.get('GSTIN') or '').strip()

        vendor_status = 'MISSING'
        vendor_id = None

        if gstin:
            gst_record = VendorMasterGSTDetails.objects.filter(
                tenant_id=tenant_id,
                gstin__iexact=gstin
            ).select_related('vendor_basic_detail').first()
            if gst_record:
                vendor_status = 'FOUND'
                vendor_id = gst_record.vendor_basic_detail.id
                vendor_name = gst_record.vendor_basic_detail.vendor_name

        if vendor_status == 'MISSING' and vendor_name:
            vendor = VendorMasterBasicDetail.objects.filter(
                tenant_id=tenant_id,
                vendor_name__iexact=vendor_name
            ).first()
            if vendor:
                vendor_status = 'FOUND'
                vendor_id = vendor.id
                vendor_name = vendor.vendor_name

        return {
            'file_name': file_name,
            'vendor_status': vendor_status,
            'vendor_id': vendor_id,
            'vendor_name': vendor_name,
            'gstin': gstin,
            'invoice_number': invoice_data.get('Supplier Invoice No') or invoice_data.get('Sales Invoice No.'),
            'invoice_date': invoice_data.get('Voucher Date') or invoice_data.get('Date'),
            'total_amount': invoice_data.get('Grand Total') or (invoice_data.get('summary_totals') or {}).get('Grand Total'),
            'address': invoice_data.get('Bill From - Address Line 1', ''),
            'city': invoice_data.get('Bill From - City', ''),
            'state': invoice_data.get('Bill From - State', ''),
            'branch': invoice_data.get('Branch', ''),
            'extracted_data': extracted_data,
            'from_cache': _from_cache,
            'cache_record_id': _cache_record_id,
        }

    def post(self, request):
        files = request.FILES.getlist('files')
        voucher_type = request.data.get('voucher_type', 'Purchase')
        upload_session_id = request.data.get('upload_session_id')
        tenant_id = request.user.tenant_id
        user_id = request.user.id

        if not files:
            return Response({'error': 'No files uploaded'}, status=status.HTTP_400_BAD_REQUEST)

        if not upload_session_id:
            return Response({'error': 'upload_session_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        scan_id = str(uuid.uuid4())
        results = []

        # Columns for extraction
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

        api_key = api_key_manager.get_healthy_key()
        if not api_key:
            return Response({'error': 'AI service busy'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        for uploaded_file in files:
            file_name = uploaded_file.name
            try:
                uploaded_file.seek(0)
                file_bytes = uploaded_file.read()
                uploaded_file.seek(0)

                # ── MULTI-INVOICE PDF SPLITTING (preprocessing layer) ────────
                if self._is_pdf(uploaded_file) and len(file_bytes) > 0:
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
                            results.append(result)
                        except Exception as split_exc:
                            results.append({
                                'file_name': f"{file_name} [Inv {inv_number}]",
                                'vendor_status': 'ERROR',
                                'error': str(split_exc),
                            })
                        finally:
                            cleanup_temp_pdf(tmp_path)

                else:
                    # ── Non-PDF (images) → original single-file flow ─────────
                    result = self._run_ocr_and_detect_vendor(
                        file_bytes=file_bytes,
                        file_name=file_name,
                        mime_type=uploaded_file.content_type or 'application/octet-stream',
                        voucher_type=voucher_type,
                        all_columns=all_columns,
                        tenant_id=tenant_id,
                        user_id=user_id,
                        upload_session_id=upload_session_id,
                    )
                    results.append(result)

            except Exception as e:
                results.append({
                    'file_name': file_name,
                    'vendor_status': 'ERROR',
                    'error': str(e)
                })

        # ── Return results list (scan_id kept for legacy compat) ──
        return Response({
            'scan_id': scan_id,
            'results': results
        })

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
