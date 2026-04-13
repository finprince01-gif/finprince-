from rest_framework import viewsets
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

        # Optional: show_all=true to skip 'to_pay' and 'payment' exclusion (e.g. for Debit Notes)
        show_all = self.request.query_params.get('show_all') == 'true'

        if not show_all:
            # MANDATORY: Only show vouchers with positive outstanding 'to_pay'
            queryset = queryset.filter(
                due_details__to_pay__isnull=False,
                due_details__to_pay__gt=0
            )

            pass # Handled by to_pay filter above
        
        # Optional: Filter by vendor name/branch if provided
        vendor_name = self.request.query_params.get('vendor_name')
        if vendor_name and vendor_name.strip():
            queryset = queryset.filter(vendor_name__iexact=vendor_name.strip())
            
        branch = self.request.query_params.get('branch')
        if branch and branch.strip():
            queryset = queryset.filter(branch__iexact=branch.strip())
            
        return queryset.order_by('-date', '-created_at')

    def perform_create(self, serializer):
        tenant_id = self.request.user.branch_id
        serializer.save(tenant_id=tenant_id)
