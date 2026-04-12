"""
API ViewSets for Separate Voucher Master Tables
"""
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import PermissionDenied
from rest_framework.decorators import action
from django.db import transaction as db_transaction


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
            return str(user.branch_id)
        raise PermissionDenied("User has no associated tenant")
    
    def get_queryset(self):
        """Filter by tenant_id"""
        try:
            tenant_id = self.get_tenant_id(self.request)
            queryset = self.queryset.filter(tenant_id=tenant_id)
            if self.action == 'list':
                return queryset.filter(is_active=True)
            return queryset
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



    def _format_invoice_number(self, config) -> str:
        # If current_number is not set, use start_from
        num = config.current_number
        if num is None:
            num = config.start_from or 1
            
        start = config.start_from or 1
        digits = config.required_digits or 4
        prefix = config.prefix or ''
        suffix = config.suffix or ''

        if suffix and str(suffix).isdigit():
            # Numeric suffix: treat as part of the total sequential number
            # Use start_from as the baseline
            base_str = str(start).zfill(digits) + str(suffix)
            base = int(base_str)
            offset = num - start
            full_num = base + offset
            total_digits = digits + len(str(suffix))
            return f"{prefix}{str(full_num).zfill(total_digits)}"
        else:
            # Non-numeric or missing suffix: pad number then append suffix
            return f"{prefix}{str(num).zfill(digits)}{suffix}"

    @action(detail=True, methods=['get'], url_path='next-number')
    def next_number(self, request, pk=None):
        series = self.get_object()
        invoice_number = self._format_invoice_number(series)
        return Response({
            'invoice_number': invoice_number,
            'current_number': series.current_number,
            'series_name': series.voucher_name,
        })

    @action(detail=True, methods=['post'], url_path='increment-number')
    def increment_number(self, request, pk=None):
        with db_transaction.atomic():
            series = self.queryset.model.objects.select_for_update().get(pk=pk)
            assigned_number = self._format_invoice_number(series)
            series.current_number = (series.current_number or series.start_from or 1) + 1
            series.save(update_fields=['current_number', 'updated_at'])

        next_invoice_number = self._format_invoice_number(series)
        return Response({
            'assigned_number': assigned_number,
            'next_invoice_number': next_invoice_number,
            'new_current_number': series.current_number,
            'series_name': series.voucher_name,
        })

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
