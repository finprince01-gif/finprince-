"""
API endpoints for Vendor Transactions.
This handles the PROCUREMENT ledger and all vendor portal transaction data.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
import logging

from .models import VendorTransaction
from .vendortransaction_serializers import VendorTransactionSerializer

logger = logging.getLogger(__name__)


class VendorTransactionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor Transactions.
    Handles fetching and managing vendor transactions with tenant isolation.
    """

    queryset = VendorTransaction.objects.all()
    serializer_class = VendorTransactionSerializer
    permission_classes = [IsAuthenticated]
    
    def get_tenant_id(self):
        """Extract tenant_id from the authenticated user"""
        user = self.request.user
        if hasattr(user, 'tenant_id'):
            return user.tenant_id
        elif hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id'):
            return user.tenant.tenant_id
        else:
            return getattr(user, 'id', 'default_tenant')

    def get_queryset(self):
        """Filter queryset by tenant"""
        tenant_id = self.get_tenant_id()
        return VendorTransaction.objects.filter(tenant_id=tenant_id).order_by('transaction_date', 'id')

    @action(detail=False, methods=['get'])
    def by_vendor(self, request):
        """
        Get all transactions for a specific vendor.
        
        GET /api/vendors/transactions/by_vendor/?vendor_id={id}
        """
        logger.info(f"=== Vendor Transactions BY VENDOR Request ===")
        vendor_id = request.query_params.get('vendor_id')
        if not vendor_id:
            return Response(
                {'error': 'vendor_id query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        tenant_id = self.get_tenant_id()
        logger.info(f"Tenant: {tenant_id}, Vendor ID: {vendor_id}")
        
        transactions = self.get_queryset().filter(vendor_id=vendor_id)
        
        # Serialize and return
        serializer = self.get_serializer(transactions, many=True)
        return Response(serializer.data)
        
    @action(detail=False, methods=['post'])
    def remove_seed_data(self, request):
        """
        Remove dummy/seed records for a specific vendor.
        """
        vendor_id = request.data.get('vendor_id')
        tenant_id = self.get_tenant_id()
        
        if not vendor_id:
            return Response({'error': 'vendor_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Define what constitutes seed data (e.g., specific reference or notes)
        # For now, let's just delete ALL transactions for this vendor if requested as "seed removal"
        # and it's specifically "ulaganathan" or has a certain marker.
        # But wait! I'll just delete transactions with 'Seed' in notes or reference if they exist.
        
        deleted_count, _ = VendorTransaction.objects.filter(
            tenant_id=tenant_id,
            vendor_id=vendor_id,
            notes__icontains='seed'
        ).delete()
        
        return Response({
            'success': True,
            'message': f'Removed {deleted_count} seed records.'
        })
