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

        # MANDATORY: Only show vouchers with positive outstanding 'to_pay'
        queryset = queryset.filter(
            due_details__to_pay__isnull=False,
            due_details__to_pay__gt=0
        )

        # Exclude purchases that already have a payment voucher linked to them
        payment_purchase_ids = Voucher.objects.filter(
            type='payment', 
            tenant_id=tenant_id,
            reference_id__isnull=False
        ).values_list('reference_id', flat=True)
        
        queryset = queryset.exclude(id__in=payment_purchase_ids)
        
        # Optional: Filter by vendor name if provided
        vendor_name = self.request.query_params.get('vendor_name')
        if vendor_name:
            queryset = queryset.filter(vendor_name=vendor_name)
            
        return queryset.order_by('-date', '-created_at')

    def perform_create(self, serializer):
        tenant_id = self.request.user.tenant_id
        serializer.save(tenant_id=tenant_id)
