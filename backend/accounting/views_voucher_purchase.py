from rest_framework import viewsets, status
from rest_framework.response import Response
from django.db import transaction as db_transaction
from .models import Voucher
from .models_voucher_purchase import VoucherPurchaseSupplierDetails
from .serializers_voucher_purchase import VoucherPurchaseSupplierDetailsSerializer


class VoucherPurchaseViewSet(viewsets.ModelViewSet):
    """
    ViewSet for handling Purchase Vouchers with all details tables.
    """
    serializer_class = VoucherPurchaseSupplierDetailsSerializer

    def get_queryset(self):
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)

        if not tenant_id:
            return VoucherPurchaseSupplierDetails.objects.none()

        queryset = VoucherPurchaseSupplierDetails.objects.filter(tenant_id=tenant_id).select_related(
            'due_details', 'transit_details', 'supply_foreign_details', 'supply_inr_details'
        )

        # For detail (retrieve/update/partial_update) actions, always return all records.
        if self.action in ('retrieve', 'update', 'partial_update'):
            return queryset.order_by('-date', '-created_at')

        # Optional: show_all=true to skip 'to_pay' and 'payment' exclusion
        show_all = self.request.query_params.get('show_all') == 'true'

        if not show_all:
            queryset = queryset.filter(
                due_details__to_pay__isnull=False,
                due_details__to_pay__gt=0
            )

        vendor_name = self.request.query_params.get('vendor_name')
        if vendor_name and vendor_name.strip():
            queryset = queryset.filter(vendor_name__iexact=vendor_name.strip())

        branch = self.request.query_params.get('branch')
        if branch and branch.strip():
            queryset = queryset.filter(branch__iexact=branch.strip())

        return queryset.order_by('-date', '-created_at')

    def get_object(self):
        """
        Override to resolve a generic Voucher ID to VoucherPurchaseSupplierDetails.
        This handles the case where the frontend passes the generic voucher ID
        (from reports/drill-down) instead of the purchase supplier details ID.
        """
        from django.http import Http404
        try:
            return super().get_object()
        except Http404:
            pk = self.kwargs.get('pk')
            # Try to find via the generic Voucher table using reference_id
            generic_voucher = Voucher.objects.filter(id=pk, type='purchase').first()
            if generic_voucher and generic_voucher.reference_id:
                self.kwargs['pk'] = generic_voucher.reference_id
                return super().get_object()
            # Also try to find directly by voucher_id on the supplier details
            instance = VoucherPurchaseSupplierDetails.objects.filter(
                tenant_id=getattr(self.request.user, 'tenant_id', None),
                voucher_id=pk
            ).first()
            if instance:
                return instance
            raise

    def update(self, request, *args, **kwargs):
        """
        Override to wrap update in atomic transaction and return 200.
        Supports both PUT and PATCH (partial update).
        """
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        try:
            with db_transaction.atomic():
                updated_instance = serializer.save()
            return Response(self.get_serializer(updated_instance).data, status=status.HTTP_200_OK)
        except Exception as e:
            import traceback
            print(f"!!! Error in PurchaseVoucher update: {str(e)}\n{traceback.format_exc()}")
            return Response(
                {"message": f"Failed to update purchase voucher: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def perform_create(self, serializer):
        tenant_id = self.request.user.branch_id
        serializer.save(tenant_id=tenant_id)
