from rest_framework import viewsets
from .models_voucher_expense import VoucherExpense
from .serializers_expense import VoucherExpenseSerializer

class VoucherExpenseViewSet(viewsets.ModelViewSet):
    queryset = VoucherExpense.objects.all()
    serializer_class = VoucherExpenseSerializer

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            return self.queryset.filter(tenant_id=user.tenant_id)
        return self.queryset
        
    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            serializer.save(tenant_id=user.tenant_id)
        else:
            serializer.save()
