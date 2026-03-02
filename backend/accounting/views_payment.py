from rest_framework import viewsets, status
from rest_framework.response import Response
from .models_voucher_payment import VoucherPaymentSingle, VoucherPaymentBulk
from .serializers_payment import VoucherPaymentSingleSerializer, VoucherPaymentBulkSerializer

class VoucherPaymentSingleViewSet(viewsets.ModelViewSet):
    queryset = VoucherPaymentSingle.objects.all()
    serializer_class = VoucherPaymentSingleSerializer
    
    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset

        # Filter by tenant_id if available on user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            queryset = queryset.filter(tenant_id=user.tenant_id)

        # Filter by pay_to (vendor name) for ledger view
        pay_to = self.request.query_params.get('pay_to')
        if pay_to:
            queryset = queryset.filter(pay_to__icontains=pay_to)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            serializer.save(tenant_id=user.tenant_id)
        else:
            serializer.save()

class VoucherPaymentBulkViewSet(viewsets.ModelViewSet):
    queryset = VoucherPaymentBulk.objects.all()
    serializer_class = VoucherPaymentBulkSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset

        if hasattr(user, 'tenant_id') and user.tenant_id:
            queryset = queryset.filter(tenant_id=user.tenant_id)

        return queryset
        
    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            serializer.save(tenant_id=user.tenant_id)
        else:
            serializer.save()
