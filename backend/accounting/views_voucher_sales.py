from rest_framework import viewsets, status
from rest_framework.response import Response
from .models_voucher_sales import VoucherSalesInvoiceDetails
from .serializers_voucher_sales import VoucherSalesInvoiceDetailsSerializer
from core.utils import TenantQuerysetMixin

class VoucherSalesViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = VoucherSalesInvoiceDetails.objects.all().order_by('-date', '-created_at')
    serializer_class = VoucherSalesInvoiceDetailsSerializer

    def perform_create(self, serializer):
        from .utils_subscription import check_subscription_limit
        check_subscription_limit(self.request.user)
        super().perform_create(serializer)

    def create(self, request, *args, **kwargs):
        # Override create to handle file uploads properly if mixed with JSON
        return super().create(request, *args, **kwargs)
