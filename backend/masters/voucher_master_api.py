"""
API ViewSets for Separate Voucher Master Tables
"""
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import PermissionDenied

from .models import (
    MasterVoucherSales,
    MasterVoucherCreditNote,
    MasterVoucherReceipts,
    MasterVoucherPurchases,
    MasterVoucherDebitNote,
    MasterVoucherPayments,
    MasterVoucherExpenses,
    MasterVoucherJournal,
    MasterVoucherContra
)
from .voucher_master_serializers import (
    MasterVoucherSalesSerializer,
    MasterVoucherCreditNoteSerializer,
    MasterVoucherReceiptsSerializer,
    MasterVoucherPurchasesSerializer,
    MasterVoucherDebitNoteSerializer,
    MasterVoucherPaymentsSerializer,
    MasterVoucherExpensesSerializer,
    MasterVoucherJournalSerializer,
    MasterVoucherContraSerializer
)


class BaseVoucherMasterViewSet(viewsets.ModelViewSet):
    """Base ViewSet for Voucher Master tables"""
    permission_classes = [IsAuthenticated]
    
    def get_tenant_id(self, request):
        """Extract tenant_id from the authenticated user"""
        user = request.user
        if hasattr(user, 'tenant_id'):
            return str(user.tenant_id)
        raise PermissionDenied("User has no associated tenant")
    
    def get_queryset(self):
        """Filter by tenant_id"""
        try:
            tenant_id = self.get_tenant_id(self.request)
            return self.queryset.filter(tenant_id=tenant_id, is_active=True)
        except:
            return self.queryset.none()
    
    def perform_create(self, serializer):
        """Set tenant_id and created_by on create"""
        tenant_id = self.get_tenant_id(self.request)
        created_by = self.request.user.username if hasattr(self.request.user, 'username') else None
        serializer.save(tenant_id=tenant_id, created_by=created_by)
    
    def perform_update(self, serializer):
        """Set updated_by on update"""
        updated_by = self.request.user.username if hasattr(self.request.user, 'username') else None
        serializer.save(updated_by=updated_by)


class MasterVoucherSalesViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Sales Voucher Master"""
    queryset = MasterVoucherSales.objects.all()
    serializer_class = MasterVoucherSalesSerializer


class MasterVoucherCreditNoteViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Credit Note Voucher Master"""
    queryset = MasterVoucherCreditNote.objects.all()
    serializer_class = MasterVoucherCreditNoteSerializer


class MasterVoucherReceiptsViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Receipts Voucher Master"""
    queryset = MasterVoucherReceipts.objects.all()
    serializer_class = MasterVoucherReceiptsSerializer


class MasterVoucherPurchasesViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Purchases Voucher Master"""
    queryset = MasterVoucherPurchases.objects.all()
    serializer_class = MasterVoucherPurchasesSerializer


class MasterVoucherDebitNoteViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Debit Note Voucher Master"""
    queryset = MasterVoucherDebitNote.objects.all()
    serializer_class = MasterVoucherDebitNoteSerializer


class MasterVoucherPaymentsViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Payments Voucher Master"""
    queryset = MasterVoucherPayments.objects.all()
    serializer_class = MasterVoucherPaymentsSerializer


class MasterVoucherExpensesViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Expenses Voucher Master"""
    queryset = MasterVoucherExpenses.objects.all()
    serializer_class = MasterVoucherExpensesSerializer


class MasterVoucherJournalViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Journal Voucher Master"""
    queryset = MasterVoucherJournal.objects.all()
    serializer_class = MasterVoucherJournalSerializer


class MasterVoucherContraViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Contra Voucher Master"""
    queryset = MasterVoucherContra.objects.all()
    serializer_class = MasterVoucherContraSerializer
