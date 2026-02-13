from rest_framework import viewsets
from .models_voucher_purchase import VoucherPurchaseSupplierDetails
from .serializers_voucher_purchase import VoucherPurchaseSupplierDetailsSerializer

class VoucherPurchaseViewSet(viewsets.ModelViewSet):
    """
    ViewSet for handling Purchase Vouchers with all details tables.
    """
    queryset = VoucherPurchaseSupplierDetails.objects.all().select_related(
        'due_details', 'transit_details', 'supply_foreign_details', 'supply_inr_details'
    )
    serializer_class = VoucherPurchaseSupplierDetailsSerializer

    def perform_create(self, serializer):
        from .utils_subscription import check_subscription_limit
        check_subscription_limit(self.request.user)
        tenant_id = self.request.user.tenant_id
        serializer.save(tenant_id=tenant_id)
