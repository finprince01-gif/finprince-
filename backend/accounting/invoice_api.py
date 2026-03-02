"""
Sales Invoice API Layer
Handles HTTP requests for sales invoices.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from core.utils import TenantQuerysetMixin, IsTenantMember
from accounting.models import SalesInvoice
from . import invoice_flow as flow
from .invoice_serializers import SalesInvoiceSerializer, SalesInvoiceListSerializer


class SalesInvoiceViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    """
    API ViewSet for Sales Invoices
    
    Endpoints:
    - GET /api/invoices/ - List invoices
    - POST /api/invoices/ - Create invoice
    - GET /api/invoices/{id}/ - Get invoice details
    - PUT /api/invoices/{id}/ - Update invoice
    - DELETE /api/invoices/{id}/ - Cancel invoice
    """
    queryset = SalesInvoice.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    
    def get_serializer_class(self):
        """Use lightweight serializer for list view"""
        if self.action == 'list':
            return SalesInvoiceListSerializer
        return SalesInvoiceSerializer
    
    def get_queryset(self):
        """Filter by status if provided"""
        queryset = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset.select_related('customer', 'voucher_type')
    
    def create(self, request, *args, **kwargs):
        """Create new invoice using flow layer"""
        try:
            tenant_id = request.user.tenant_id
            
            # Prepare data
            invoice_data = {
                'invoice_date': request.data.get('invoice_date'),
                'voucher_type_id': request.data.get('voucher_type'),
                'customer_id': request.data.get('customer'),
                'bill_to_address': request.data.get('bill_to_address'),
                'bill_to_gstin': request.data.get('bill_to_gstin'),
                'bill_to_contact': request.data.get('bill_to_contact'),
                'bill_to_state': request.data.get('bill_to_state'),
                'bill_to_country': request.data.get('bill_to_country', 'India'),
                'ship_to_address': request.data.get('ship_to_address'),
                'ship_to_state': request.data.get('ship_to_state'),
                'ship_to_country': request.data.get('ship_to_country', 'India'),
            }
            
            # Create via flow layer
            result = flow.create_invoice(tenant_id, invoice_data)
            
            return Response(result, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def update(self, request, *args, **kwargs):
        """Update invoice using flow layer"""
        try:
            tenant_id = request.user.tenant_id
            invoice_id = kwargs.get('pk')
            
            # Update via flow layer
            result = flow.update_invoice(invoice_id, tenant_id, request.data)
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def destroy(self, request, *args, **kwargs):
        """Cancel invoice"""
        try:
            tenant_id = request.user.tenant_id
            invoice_id = kwargs.get('pk')
            
            # Cancel via flow layer
            flow.cancel_invoice(invoice_id, tenant_id)
            
            return Response(
                {'message': 'Invoice cancelled successfully'},
                status=status.HTTP_200_OK
            )
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
