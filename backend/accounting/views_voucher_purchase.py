from rest_framework import viewsets
from .models_voucher_purchase import VoucherPurchaseSupplierDetails
from .serializers_voucher_purchase import VoucherPurchaseSupplierDetailsSerializer

class VoucherPurchaseViewSet(viewsets.ModelViewSet):
    """
    ViewSet for handling Purchase Vouchers with all details tables.
    """
    serializer_class = VoucherPurchaseSupplierDetailsSerializer

    def get_queryset(self):
        tenant_id = self.request.user.tenant_id
        queryset = VoucherPurchaseSupplierDetails.objects.filter(tenant_id=tenant_id).select_related(
            'due_details', 'transit_details', 'supply_foreign_details', 'supply_inr_details'
        )
        
        vendor_name = self.request.query_params.get('vendor_name')
        if vendor_name:
            queryset = queryset.filter(vendor_name=vendor_name)
            
        return queryset

    def perform_create(self, serializer):
        tenant_id = self.request.user.tenant_id
        serializer.save(tenant_id=tenant_id)
