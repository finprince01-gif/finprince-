"""
Masters API Layer - HTTP Routing ONLY
NO business logic, NO RBAC, NO tenant validation.
Only HTTP handling - all logic delegated to flow.py
"""

from rest_framework import viewsets, status  # type: ignore
from rest_framework.decorators import action  # type: ignore
from rest_framework.response import Response  # type: ignore
from rest_framework.permissions import IsAuthenticated, AllowAny  # type: ignore
from accounting.models import (  # type: ignore
    MasterLedgerGroup, MasterLedger, MasterHierarchyRaw,
    AmountTransaction
)
from .models import (  # type: ignore
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
# Aliases for backward compatibility or specific use cases
MasterVoucherConfig = MasterVoucherSales
VoucherConfiguration = MasterVoucherSales

from accounting.serializers import (  # type: ignore
    MasterLedgerGroupSerializer, MasterLedgerSerializer,
    MasterHierarchyRawSerializer,
    AmountTransactionSerializer
)
from .serializers import VoucherConfigurationSerializer, MasterVoucherConfigSerializer  # type: ignore
from . import flow  # type: ignore


# ============================================================================
# LEDGER GROUP VIEWSET
# ============================================================================

class MasterLedgerGroupViewSet(viewsets.ModelViewSet):
    """
    API endpoints for ledger groups.
    All logic delegated to flow layer.
    """
    queryset = MasterLedgerGroup.objects.all()
    serializer_class = MasterLedgerGroupSerializer
    permission_classes = [AllowAny]  # TEMPORARY: Disabled for development
    # permission_classes = [IsAuthenticated]

    
    def get_queryset(self):
        """Delegate to flow layer."""
        if not self.request.user.is_authenticated:
            return MasterLedgerGroup.objects.none()
        # Inject request for tenant resolution
        self.request.user._request = self.request
        return flow.list_ledger_groups(self.request.user)
    
    def create(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Inject request for tenant resolution
        request.user._request = request
        ledger_group = flow.create_ledger_group(request.user, serializer.validated_data)
        
        response_serializer = self.get_serializer(ledger_group)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )
    
    def update(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        # Inject request for tenant resolution
        request.user._request = request
        ledger_group = flow.update_ledger_group(
            request.user,
            instance.id,
            serializer.validated_data
        )
        
        response_serializer = self.get_serializer(ledger_group)
        return Response(response_serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        instance = self.get_object()
        # Inject request for tenant resolution
        request.user._request = request
        flow.delete_ledger_group(request.user, instance.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================================================
# LEDGER VIEWSET
# ============================================================================

class MasterLedgerViewSet(viewsets.ModelViewSet):
    """
    API endpoints for ledgers.
    All logic delegated to flow layer.
    """
    queryset = MasterLedger.objects.all()
    serializer_class = MasterLedgerSerializer
    permission_classes = [AllowAny]  # TEMPORARY: Disabled for development
    # permission_classes = [IsAuthenticated]

    
    def get_queryset(self):
        """Delegate to flow layer."""
        if not self.request.user.is_authenticated:
            return MasterLedger.objects.none()
        # Inject request for tenant resolution
        self.request.user._request = self.request
        return flow.list_ledgers(self.request.user)
    
    def list(self, request, *args, **kwargs):
        """Override list to delegate to flow layer."""
        try:
            queryset = self.get_queryset()
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        except Exception as e:
            import logging
            logger = logging.getLogger('masters.api')
            logger.error(f"❌ Error in list: {type(e).__name__}: {str(e)}", exc_info=True)
            raise
    
    def create(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        try:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            
            # Inject request for tenant resolution
            request.user._request = request
            ledger = flow.create_ledger(request.user, serializer.validated_data)
            
            response_serializer = self.get_serializer(ledger)
            headers = self.get_success_headers(response_serializer.data)
            return Response(
                response_serializer.data,
                status=status.HTTP_201_CREATED,
                headers=headers
            )
        except Exception as e:
            import logging
            logger = logging.getLogger('masters.api')
            logger.error(f"❌ Error creating ledger: {type(e).__name__}: {str(e)}", exc_info=True)
            raise
    
    def update(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        try:
            partial = kwargs.pop('partial', False)
            instance = self.get_object()
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            
            # Inject request for tenant resolution
            request.user._request = request
            ledger = flow.update_ledger(
                request.user,
                instance.id,
                serializer.validated_data
            )
            
            response_serializer = self.get_serializer(ledger)
            return Response(response_serializer.data)
        except Exception as e:
            import logging
            logger = logging.getLogger('masters.api')
            logger.error(f"❌ Error updating ledger: {type(e).__name__}: {str(e)}", exc_info=True)
            raise
    
    def destroy(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        instance = self.get_object()
        # Inject request for tenant resolution
        request.user._request = request
        flow.delete_ledger(request.user, instance.id)
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    @action(detail=False, methods=['get'], url_path='cash-bank')
    def cash_bank(self, request):
        """Get only Cash and Bank ledgers."""
        try:
            # Inject request for tenant resolution
            request.user._request = request
            ledgers = flow.list_cash_bank_ledgers(request.user)
            serializer = self.get_serializer(ledgers, many=True)
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================================
# VOUCHER CONFIG VIEWSET
# ============================================================================

class MasterVoucherConfigViewSet(viewsets.ModelViewSet):
    """
    API endpoints for voucher configurations.
    All logic delegated to flow layer.
    """
    queryset = MasterVoucherConfig.objects.all()
    serializer_class = MasterVoucherConfigSerializer
    permission_classes = [IsAuthenticated]

    
    def get_queryset(self):
        """Delegate to flow layer."""
        return flow.list_voucher_configs(self.request.user)
    
    def create(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        config = flow.create_voucher_config(request.user, serializer.validated_data)
        
        response_serializer = self.get_serializer(config)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )
    
    def update(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        config = flow.update_voucher_config(
            request.user,
            instance.id,
            serializer.validated_data
        )
        
        response_serializer = self.get_serializer(config)
        return Response(response_serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        instance = self.get_object()
        flow.delete_voucher_config(request.user, instance.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================================================
# HIERARCHY VIEWSET (Global - No Authentication)
# ============================================================================

class MasterHierarchyRawViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Global hierarchy data - no authentication required, no tenant filtering.
    Returns flat rows that match the frontend HierarchyRow TypeScript interface.
    The frontend (LedgerCreationWizard, HierarchicalDropdown) builds its own
    tree client-side from these flat rows.
    """
    queryset = MasterHierarchyRaw.objects.none()  # Unused - raw SQL used instead
    serializer_class = MasterHierarchyRawSerializer
    permission_classes = [AllowAny]  # Global data, accessible to all

    def list(self, request, *args, **kwargs):
        """
        Returns flat rows from master_hierarchy_raw with field names that
        match the frontend HierarchyRow interface:
        [
            {
                "id": 1,
                "type_of_business_1": "Company",
                "financial_reporting_1": "Balance Sheet",
                "major_group_1": "Owners' Funds",
                "group_1": "Share capital",
                "sub_group_1_1": "Equity Share Capital",
                "sub_group_2_1": null,
                "sub_group_3_1": null,
                "ledger_1": null,
                "code": "..."
            },
            ...
        ]
        """
        from accounting.hierarchy_service import get_flat_hierarchy_rows
        rows = get_flat_hierarchy_rows()
        return Response(rows)


# ============================================================================
# VOUCHER CONFIGURATION VIEWSET
# ============================================================================

class VoucherConfigurationViewSet(viewsets.ModelViewSet):
    """
    API endpoints for voucher configurations.
    All logic delegated to flow layer.
    """
    queryset = VoucherConfiguration.objects.all()
    serializer_class = VoucherConfigurationSerializer
    permission_classes = [IsAuthenticated]

    
    def get_queryset(self):
        """Delegate to flow layer."""
        voucher_type = self.request.query_params.get('voucher_type', 'sales')
        return flow.list_voucher_configurations(self.request.user, voucher_type=voucher_type)
    
    def create(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        config = flow.create_voucher_configuration(request.user, serializer.validated_data)
        
        response_serializer = self.get_serializer(config)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )
    
    def update(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        config = flow.update_voucher_configuration(
            request.user,
            instance.id,
            serializer.validated_data
        )
        
        response_serializer = self.get_serializer(config)
        return Response(response_serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        instance = self.get_object()
        flow.delete_voucher_configuration(request.user, instance.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================================================
# AMOUNT TRANSACTION VIEWSET
# ============================================================================

class AmountTransactionViewSet(viewsets.ModelViewSet):
    """
    API endpoints for amount transactions.
    All logic delegated to flow layer.
    """
    queryset = AmountTransaction.objects.all()
    serializer_class = AmountTransactionSerializer
    permission_classes = [IsAuthenticated]

    
    def get_queryset(self):
        """Delegate to flow layer with optional filters."""
        ledger_id = self.request.query_params.get('ledger_id')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        return flow.list_amount_transactions(
            self.request.user,
            ledger_id=ledger_id,
            start_date=start_date,
            end_date=end_date
        )
    
    def create(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        transaction = flow.create_amount_transaction(request.user, serializer.validated_data)
        
        response_serializer = self.get_serializer(transaction)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )
    
    def update(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        transaction = flow.update_amount_transaction(
            request.user,
            instance.id,
            serializer.validated_data
        )
        
        response_serializer = self.get_serializer(transaction)
        return Response(response_serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        instance = self.get_object()
        flow.delete_amount_transaction(request.user, instance.id)
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    @action(detail=False, methods=['post'])
    def sync_opening_balances(self, request):
        """
        Sync opening balances from Cash and Bank ledgers.
        """
        created_count = flow.sync_opening_balances_to_transactions(request.user)
        return Response({
            'message': f'Successfully synced {created_count} opening balances',
            'count': created_count
        })
