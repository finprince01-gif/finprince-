from rest_framework import viewsets, status
from rest_framework.response import Response
from django.db import transaction as db_transaction
from .models_voucher_expense import VoucherExpense
from .serializers_expense import VoucherExpenseSerializer

class VoucherExpenseViewSet(viewsets.ModelViewSet):
    queryset = VoucherExpense.objects.all()
    serializer_class = VoucherExpenseSerializer

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.branch_id:
            return self.queryset.filter(tenant_id=user.branch_id)
        return self.queryset

    def update(self, request, *args, **kwargs):
        """Override to wrap update in atomic transaction and return 200."""
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
            print(f"!!! Error in Expense update: {str(e)}\n{traceback.format_exc()}")
            return Response(
                {"message": f"Failed to update expense voucher: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.branch_id:
            serializer.save(tenant_id=user.branch_id)
        else:
            serializer.save()

