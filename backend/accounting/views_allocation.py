from rest_framework import viewsets, permissions
from .models import TransactionAllocation as VoucherAllocation
from .serializers_allocation import VoucherAllocationSerializer

class VoucherAllocationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing Voucher Allocations.
    Provides standard CRUD operations for TransactionAllocation records.
    """
    queryset = VoucherAllocation.objects.all()
    serializer_class = VoucherAllocationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        tenant_id = self.request.user.branch_id if hasattr(self.request.user, 'branch_id') else None
        qs = super().get_queryset()
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        
        # Optional filtering by transaction or reference
        transaction_id = self.request.query_params.get('transaction')
        if transaction_id:
            qs = qs.filter(transaction_id=transaction_id)
            
        reference_id = self.request.query_params.get('reference_id')
        if reference_id:
            qs = qs.filter(reference_id=reference_id)
            
        return qs

    def perform_create(self, serializer):
        tenant_id = self.request.user.branch_id if hasattr(self.request.user, 'branch_id') else None
        serializer.save(tenant_id=tenant_id)