import logging
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import PendingPurchase
from django.db import transaction

logger = logging.getLogger(__name__)


class PendingPurchaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendingPurchase
        fields = '__all__'


class PendingPurchaseViewSet(viewsets.ModelViewSet):
    queryset = PendingPurchase.objects.all()
    serializer_class = PendingPurchaseSerializer
    permission_classes = [IsAuthenticated]

    def _sync_related_rows(self, pp):
        """
        Surgical fix: Automatically revalidate other pending purchases from the same vendor 
        to prevent stale CREATE_VENDOR / CREATE_ITEM statuses when master records are created.
        """
        try:
            from django.db.models import Q
            from ocr_pipeline.models import InvoiceTempOCR
            from ocr_pipeline.pipeline import validate_and_process

            related_qs = PendingPurchase.objects.filter(
                company_id=pp.company_id,
                pending_purchase_status='PENDING'
            ).exclude(id=pp.id)

            if pp.vendor_gstin:
                related_qs = related_qs.filter(Q(vendor_gstin=pp.vendor_gstin) | Q(vendor_name=pp.vendor_name))
            elif pp.vendor_name:
                related_qs = related_qs.filter(vendor_name=pp.vendor_name)
            else:
                return

            for related_pp in related_qs:
                staging = InvoiceTempOCR.objects.filter(id=related_pp.source_scan_row_id).first()
                if staging:
                    InvoiceTempOCR.objects.filter(id=related_pp.source_scan_row_id).update(
                        processed=False,
                        validation_status='PENDING',
                        status='FINALIZED'
                    )
                    staging.refresh_from_db()
                    validate_and_process(staging, auto_save=True)
                    logger.info(f"[SYNC_RELATED_ROW] id={related_pp.id} auto-synced due to trigger_id={pp.id}")
        except Exception as e:
            logger.error(f"[SYNC_RELATED_ROWS_ERROR] trigger_id={pp.id} error={e}")

    def get_queryset(self):
        tenant_id = getattr(self.request.user, 'branch_id', None)
        if not tenant_id:
            tenant_id = getattr(self.request.user, 'tenant_id', None)

        logger.info(f"[PENDING_QUEUE_FETCH] Fetching pending purchases for tenant: {tenant_id}")

        qs = PendingPurchase.objects.filter(company_id=tenant_id)

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(pending_purchase_status=status_param)

        return qs.order_by('-created_at')

    @action(detail=True, methods=['get'])
    def staging_row(self, request, pk=None):
        """
        Return the full InvoiceTempOCR staging record for this pending purchase.
        The frontend uses this to populate EditInvoiceModal with the same data
        structure as Purchase Upload Review.
        """
        try:
            pp = self.get_object()
            from ocr_pipeline.models import InvoiceTempOCR

            staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
            if not staging:
                return Response(
                    {'error': f'Staging record {pp.source_scan_row_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            staging_data = {
                'id': staging.id,
                'file_hash': staging.file_hash,
                'file_path': staging.file_path,
                'upload_session_id': staging.upload_session_id,
                'extracted_data': staging.extracted_data,
                'supplier_invoice_no': staging.supplier_invoice_no,
                'gstin': staging.gstin,
                'branch': staging.branch,
                'validation_status': staging.validation_status,
                'status': staging.status,
                'validation_message': staging.validation_message,
                'vendor_id': staging.vendor_id,
                'vendor_name': getattr(staging, 'vendor_name', pp.vendor_name),
                'vendor_status': getattr(staging, 'vendor_status', pp.vendor_status),
                'voucher_id': staging.voucher_id,
            }
            return Response({'staging_row': staging_data, 'pending_purchase': PendingPurchaseSerializer(pp).data})
        except Exception as e:
            logger.exception(f"[PENDING_STAGING_ROW_ERROR] pk={pk} error={e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def revalidate(self, request, pk=None):
        """
        Re-run the same validate_and_process pipeline used by Purchase Upload.
        Updates the PendingPurchase queue row via evaluate_pending_purchase (update_or_create).
        Called after user creates a vendor or item to refresh statuses.
        """
        try:
            pp = self.get_object()
            logger.critical(f"[AUTO_REVALIDATE_TRIGGERED] id={pp.id} source_scan_row_id={pp.source_scan_row_id}")
            logger.info(
                f"[PENDING_REVALIDATE] id={pp.id} invoice={pp.invoice_number} "
                f"source_row={pp.source_scan_row_id}"
            )

            from ocr_pipeline.models import InvoiceTempOCR
            staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
            if not staging:
                return Response(
                    {'error': f'Staging record {pp.source_scan_row_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Temporarily unmark processed so the pipeline can re-evaluate.
            InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).update(
                processed=False,
                validation_status='PENDING',
                status='FINALIZED'
            )
            staging = InvoiceTempOCR.objects.get(id=pp.source_scan_row_id)

            from ocr_pipeline.pipeline import validate_and_process
            # Pass auto_save=True so that if the pending purchase is fully resolved,
            # it automatically proceeds to create the Voucher.
            result = validate_and_process(staging, auto_save=True)
            
            if isinstance(result, dict) and result.get("status") == "LOCK_HELD":
                return Response({'error': 'Record is currently being processed by another background task. Please try again in a few seconds.'}, status=409)

            logger.info(
                f"[PENDING_REVALIDATE_RESULT] id={pp.id} result={result} "
                f"staging_validation={staging.validation_status}"
            )

            pp.refresh_from_db()
            logger.critical(f"[QUEUE_SYNCHRONIZED] id={pp.id} vendor_status={pp.vendor_status} item_status={pp.item_status} voucher_status={pp.voucher_status}")

            self._sync_related_rows(pp)

            return Response({
                'status': result.get('status') if isinstance(result, dict) else str(result),
                'vendor_status': pp.vendor_status,
                'item_status': pp.item_status,
                'voucher_status': pp.voucher_status,
                'pending_purchase_status': pp.pending_purchase_status,
            })
        except Exception as e:
            logger.exception(f"[PENDING_REVALIDATE_ERROR] pk={pk} error={e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='match-item')
    def match_item(self, request, pk=None):
        """
        Direct inventory match for a pending purchase staging item.
        Delegates to OCRStagingMatchItemView — NO vendor required.
        Body: { inventory_item_id, item_name, line_index }
        """
        try:
            pp = self.get_object()
            from ocr_pipeline.models import InvoiceTempOCR
            staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
            if not staging:
                return Response(
                    {'error': f'Staging record {pp.source_scan_row_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Delegate to OCRStagingMatchItemView using the staging record id
            from ocr_pipeline.views import OCRStagingMatchItemView
            match_view = OCRStagingMatchItemView()
            match_view.request = request
            result = match_view.post(request, file_hash=str(staging.id))

            # After match, run validation pipeline to recompute all statuses
            if getattr(result, 'status_code', 200) == 200:
                from ocr_pipeline.pipeline import validate_and_process
                staging.refresh_from_db()
                validate_and_process(staging, auto_save=False)
                pp.refresh_from_db()
                
                self._sync_related_rows(pp)

            return result
        except Exception as e:
            logger.exception(f"[PENDING_MATCH_ITEM_ERROR] pk={pk} error={e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """
        Finalize a single pending purchase using the exact same engine as Purchase Upload.
        Flow: reset staging → validate_and_process(auto_save=True) → mark RESOLVED.
        """
        try:
            with transaction.atomic():
                pp = self.get_object()
                logger.info(
                    f"[PENDING_QUEUE_RESOLVE] resolving invoice={pp.invoice_number} "
                    f"source_row={pp.source_scan_row_id} current_status={pp.pending_purchase_status}"
                )

                if pp.pending_purchase_status == 'RESOLVED':
                    return Response({'status': 'already_resolved', 'message': 'This pending purchase has already been resolved.'})

                from ocr_pipeline.models import InvoiceTempOCR
                staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
                if not staging:
                    return Response(
                        {'error': f'Staging record {pp.source_scan_row_id} not found. Cannot finalize.'},
                        status=status.HTTP_404_NOT_FOUND
                    )

                InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).update(
                    processed=False,
                    validation_status='NEED_TO_SAVE',
                    status='FINALIZED'
                )
                staging = InvoiceTempOCR.objects.get(id=pp.source_scan_row_id)

                logger.info(f"[PENDING_STAGING_UNBLOCKED] staging_id={staging.id} reset for finalization")

                from ocr_pipeline.pipeline import validate_and_process
                result = validate_and_process(staging, auto_save=True)
                
                if isinstance(result, dict) and result.get("status") == "LOCK_HELD":
                    return Response({'error': 'Record is currently being processed by another background task. Please try again in a few seconds.'}, status=409)

                logger.info(f"[PENDING_PIPELINE_RESULT] staging_id={staging.id} result={result}")

                save_status = result.get('status') if isinstance(result, dict) else None

                if save_status not in ('VOUCHER_CREATED', 'SUCCESS'):
                    InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).update(
                        processed=True,
                        validation_status='PENDING_PURCHASE',
                        status='FINALIZED'
                    )
                    return Response(
                        {
                            'error': f'Save failed: {result.get("validation_message", save_status)}',
                            'pipeline_result': result
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )

                staging.refresh_from_db()

                InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).update(
                    status='FINALIZED',
                    processed=True
                )

                pp.pending_purchase_status = 'RESOLVED'
                if staging.voucher_id:
                    pp.review_payload = pp.review_payload or {}
                    pp.review_payload['resolved_voucher_id'] = staging.voucher_id
                from django.utils import timezone
                pp.resolved_at = timezone.now()
                pp.save()

                logger.info(
                    f"[PENDING_QUEUE_FINALIZED] pending purchase id={pp.id} resolved. "
                    f"voucher_id={staging.voucher_id} staging_validation={staging.validation_status}"
                )

                return Response({
                    'status': 'resolved',
                    'voucher_id': staging.voucher_id,
                    'validation_status': staging.validation_status,
                })

        except Exception as e:
            logger.exception(f"[PENDING_QUEUE_RESOLVE_ERROR] pk={pk} error={e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # ── Eligibility helpers shared by preview and finalize_all ────────────────
    _ELIGIBLE_VENDOR   = ['VENDOR_STATUS_EXISTING', 'ALREADY_EXIST', 'EXISTS']
    _ELIGIBLE_ITEM     = ['ITEM_STATUS_EXISTING', 'ALREADY_EXIST', 'ALREADY EXIST']
    _ELIGIBLE_VOUCHER  = ['VOUCHER_STATUS_NEW', 'NEED_TO_SAVE', 'NEW']

    def _eligible_qs(self, tenant_id):
        return PendingPurchase.objects.filter(
            company_id=tenant_id,
            pending_purchase_status='PENDING',
            vendor_status__in=self._ELIGIBLE_VENDOR,
            item_status__in=self._ELIGIBLE_ITEM,
            voucher_status__in=self._ELIGIBLE_VOUCHER,
        )

    @action(detail=False, methods=['get'], url_path='finalize-all/preview')
    def finalize_all_preview(self, request):
        """
        Returns eligible vs ineligible counts for the bulk-finalize confirmation dialog.
        GET /api/pending-purchases/finalize-all/preview/
        """
        tenant_id = getattr(request.user, 'branch_id', None) or getattr(request.user, 'tenant_id', None)
        total_pending = PendingPurchase.objects.filter(company_id=tenant_id, pending_purchase_status='PENDING').count()
        eligible = self._eligible_qs(tenant_id).count()
        skipped = total_pending - eligible

        return Response({
            'eligible': eligible,
            'skipped': skipped,
            'total': total_pending,
        })

    @action(detail=False, methods=['post'], url_path='finalize-all')
    def finalize_all(self, request):
        """
        Bulk finalize all eligible pending purchases.

        Reuses the IDENTICAL resolve() pipeline — validate_and_process(auto_save=True).
        No new finalization logic. Two entry points, one engine.

        POST /api/pending-purchases/finalize-all/
        Response: { processed, skipped, failed, errors }
        """
        tenant_id = getattr(request.user, 'branch_id', None) or getattr(request.user, 'tenant_id', None)

        eligible_records = list(self._eligible_qs(tenant_id))
        total_pending = PendingPurchase.objects.filter(company_id=tenant_id, pending_purchase_status='PENDING').count()
        skipped_count = total_pending - len(eligible_records)

        logger.info(f"[BULK_FINALIZE_START] tenant={tenant_id} eligible={len(eligible_records)} skipped={skipped_count}")

        processed_count = 0
        failed_count = 0
        errors = []

        from ocr_pipeline.models import InvoiceTempOCR
        from ocr_pipeline.pipeline import validate_and_process
        from django.utils import timezone

        for pp in eligible_records:
            try:
                with transaction.atomic():
                    staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
                    if not staging:
                        raise ValueError(f'Staging record {pp.source_scan_row_id} not found')

                    # Identical reset to single-row resolve()
                    InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).update(
                        processed=False,
                        validation_status='NEED_TO_SAVE',
                        status='FINALIZED'
                    )
                    staging = InvoiceTempOCR.objects.get(id=pp.source_scan_row_id)

                    # Canonical engine — same as Purchase Upload finalize
                    result = validate_and_process(staging, auto_save=True)
                    save_status = result.get('status') if isinstance(result, dict) else None

                    if save_status not in ('VOUCHER_CREATED', 'SUCCESS'):
                        InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).update(
                            processed=True,
                            validation_status='PENDING_PURCHASE',
                            status='FINALIZED'
                        )
                        raise ValueError(result.get('validation_message', save_status))

                    staging.refresh_from_db()
                    InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).update(
                        status='FINALIZED',
                        processed=True
                    )

                    pp.pending_purchase_status = 'RESOLVED'
                    pp.resolved_at = timezone.now()
                    if staging.voucher_id:
                        pp.review_payload = pp.review_payload or {}
                        pp.review_payload['resolved_voucher_id'] = staging.voucher_id
                    pp.save()

                    processed_count += 1
                    logger.info(f"[BULK_FINALIZE_ROW_OK] pp_id={pp.id} invoice={pp.invoice_number} voucher_id={staging.voucher_id}")

            except Exception as ex:
                failed_count += 1
                errors.append({'pending_id': pp.id, 'invoice': pp.invoice_number, 'error': str(ex)})
                logger.exception(f"[BULK_FINALIZE_ROW_ERROR] pp_id={pp.id} error={ex}")

        logger.info(f"[BULK_FINALIZE_DONE] processed={processed_count} skipped={skipped_count} failed={failed_count}")
        logger.critical(f"[CLEANUP_FINALIZED_VOUCHERS] tenant={tenant_id} processed={processed_count} skipped={skipped_count} failed={failed_count}")

        return Response({
            'success': True,
            'processed': processed_count,
            'skipped': skipped_count,
            'failed': failed_count,
            'errors': errors[:20],
        })
