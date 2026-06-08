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
                'vendor_id': staging.vendor_id,
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
            # Use update() to bypass save() guards, keeping FINALIZED status to avoid
            # any downstream status regression.
            InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).update(
                processed=False,
                validation_status='PENDING',
                status='FINALIZED'
            )
            # Reload to get fresh in-memory state
            staging = InvoiceTempOCR.objects.get(id=pp.source_scan_row_id)

            # Run the canonical pipeline (auto_save=False → validates only, does not create voucher).
            # evaluate_pending_purchase is now called unconditionally inside validate_and_process,
            # so the PendingPurchase row is updated via update_or_create automatically.
            from ocr_pipeline.pipeline import validate_and_process
            result = validate_and_process(staging, auto_save=False)

            logger.info(
                f"[PENDING_REVALIDATE_RESULT] id={pp.id} result={result} "
                f"staging_validation={staging.validation_status}"
            )

            # Re-read the PendingPurchase row — it was updated by evaluate_pending_purchase
            pp.refresh_from_db()

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

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """
        Finalize the pending purchase by running the exact same save engine as Purchase Upload.

        Flow:
          1. Load InvoiceTempOCR via source_scan_row_id
          2. Unmark processed so the pipeline save path runs
          3. Call validate_and_process(staging_record, auto_save=True)
             → VoucherPurchaseSupplierDetailsSerializer.create()
             → _post_journal_entries()
             → sync_purchase_to_grn()
             → _mirror_to_vendor_portal()
          4. Sync result back to PendingPurchase queue row
          5. Return voucher_id on success
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

                # 1. Load the staging record
                from ocr_pipeline.models import InvoiceTempOCR
                staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
                if not staging:
                    return Response(
                        {'error': f'Staging record {pp.source_scan_row_id} not found. Cannot finalize.'},
                        status=status.HTTP_404_NOT_FOUND
                    )

                # 2. Temporarily allow the pipeline to run the save path
                #    Use update() to bypass save() guards, and avoid status regression (keep FINALIZED status)
                InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).update(
                    processed=False,
                    validation_status='NEED_TO_SAVE',
                    status='FINALIZED'
                )

                # Reload staging
                staging = InvoiceTempOCR.objects.get(id=pp.source_scan_row_id)

                logger.info(f"[PENDING_STAGING_UNBLOCKED] staging_id={staging.id} reset for finalization")

                # 3. Execute the canonical save engine (same as Purchase Upload finalize)
                from ocr_pipeline.pipeline import validate_and_process
                result = validate_and_process(staging, auto_save=True)

                logger.info(f"[PENDING_PIPELINE_RESULT] staging_id={staging.id} result={result}")

                save_status = result.get('status') if isinstance(result, dict) else None

                if save_status not in ('VOUCHER_CREATED', 'SUCCESS'):
                    # Restore pending state so user can retry
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

                # 4. Sync status to the queue row
                # Reload staging to get latest voucher_id set by serializer
                staging.refresh_from_db()

                # Succeeded: ensure status is FINALIZED and processed=True (same update strategy as FinalizeWorker)
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
