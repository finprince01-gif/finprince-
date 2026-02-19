from rest_framework import viewsets, status
from rest_framework.response import Response
from .models_voucher_receipt import VoucherReceiptSingle, VoucherReceiptBulk
from .serializers_receipt import VoucherReceiptSingleSerializer, VoucherReceiptBulkSerializer

class VoucherReceiptSingleViewSet(viewsets.ModelViewSet):
    queryset = VoucherReceiptSingle.objects.all()
    serializer_class = VoucherReceiptSingleSerializer
    
    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset

        # Filter by tenant_id if available on user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            queryset = queryset.filter(tenant_id=user.tenant_id)

        # Filter by receive_from (vendor/party name) for ledger view
        receive_from = self.request.query_params.get('receive_from')
        if receive_from:
            queryset = queryset.filter(receive_from__icontains=receive_from)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            serializer.save(tenant_id=user.tenant_id)
        else:
            serializer.save()

class VoucherReceiptBulkViewSet(viewsets.ModelViewSet):
    queryset = VoucherReceiptBulk.objects.all()
    serializer_class = VoucherReceiptBulkSerializer

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
