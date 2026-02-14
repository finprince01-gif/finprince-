"""
Sales Voucher API Layer
REST API endpoints for sales voucher operations.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import os

from accounting.models import (
    SalesVoucher,
    SalesVoucherItem,
    SalesVoucherDocument,
    ReceiptVoucherType,
    MasterLedger
)
from accounting.sales_serializers import (
    SalesVoucherSerializer,
    SalesVoucherListSerializer,
    SalesVoucherCreateSerializer,
    SalesVoucherItemSerializer,
    SalesVoucherDocumentSerializer,
    ReceiptVoucherTypeSerializer,
    CustomerAddressSerializer,
    TaxTypeDeterminationSerializer,
    FileUploadSerializer,
    VoucherConfigurationDropdownSerializer
)
from accounting import sales_flow, sales_database
from core.tenant import get_tenant_from_request


class ReceiptVoucherTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for Receipt Voucher Types.
    
    GET /api/vouchers/receipt-types/ - List all active receipt voucher types
    GET /api/vouchers/receipt-types/{id}/ - Retrieve a specific voucher type
    """
    serializer_class = ReceiptVoucherTypeSerializer
    permission_classes = [IsAuthenticated]
    
    def list(self, request, *args, **kwargs):
        """
        List voucher types.
        Prioritizes returning VoucherConfigurations if available for the type (e.g. 'sales').
        Falls back to ReceiptVoucherTypes.
        """
        tenant_id = get_tenant_from_request(request)
        v_type = request.query_params.get('type')  # Optional type filter
        
        # 1. Try fetching from VoucherConfiguration
        # If type is specified (e.g. 'sales'), or generally if configs exist
        configs = sales_database.get_voucher_configurations(tenant_id, voucher_type=v_type)
        
        if configs.exists():
            serializer = VoucherConfigurationDropdownSerializer(configs, many=True)
            return Response(serializer.data)
            
        # 2. Fallback to ReceiptVoucherType (Legacy/Seeded)
        types = sales_database.get_voucher_types(tenant_id)
        serializer = ReceiptVoucherTypeSerializer(types, many=True)
        return Response(serializer.data)

    def get_queryset(self):
        # Fallback for other methods
        tenant_id = get_tenant_from_request(self.request)
        return sales_database.get_voucher_types(tenant_id)


class SalesVoucherViewSet(viewsets.ModelViewSet):
    """
    API endpoint for Sales Vouchers.
    
    GET /api/vouchers/sales/ - List all sales vouchers
    POST /api/vouchers/sales/ - Create a new sales voucher
    GET /api/vouchers/sales/{id}/ - Retrieve a specific sales voucher
    PUT /api/vouchers/sales/{id}/ - Update a sales voucher
    PATCH /api/vouchers/sales/{id}/ - Partial update
    DELETE /api/vouchers/sales/{id}/ - Delete (cancel) a sales voucher
    """
    serializer_class = SalesVoucherSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        """Use lightweight serializer for list view"""
        if self.action == 'list':
            return SalesVoucherListSerializer
        return SalesVoucherSerializer

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        if not tenant_id:
            return SalesVoucher.objects.none()

        # Get filter parameters
        filters = {}
        if self.request.query_params.get('date_from'):
            filters['date_from'] = self.request.query_params['date_from']
        if self.request.query_params.get('date_to'):
            filters['date_to'] = self.request.query_params['date_to']
            
        # Ensure customer_id is a valid integer if provided
        customer_id = self.request.query_params.get('customer_id')
        if customer_id and customer_id.isdigit():
            filters['customer_id'] = int(customer_id)
        elif customer_id:
            # If invalid ID format, return empty to avoid slow queries or errors
            return SalesVoucher.objects.none()

        if self.request.query_params.get('status'):
            filters['status'] = self.request.query_params['status']
        
        prefetch = (self.action != 'list')
        queryset = sales_database.get_sales_vouchers(tenant_id, filters, prefetch=prefetch)
        
        # Security/Performance: Always limit list results to prevent timeouts
        if self.action == 'list':
            return queryset[:1000]
            
        return queryset
    
    def create(self, request, *args, **kwargs):
        """Create a new sales voucher"""
        tenant_id = get_tenant_from_request(request)
        
        # Get company state for tax determination
        from core.models import CompanyFullInfo
        try:
            company = CompanyFullInfo.objects.get(tenant_id=tenant_id)
            user_state = company.state or ''
        except CompanyFullInfo.DoesNotExist:
            user_state = ''
        
        # Validate input data
        serializer = SalesVoucherCreateSerializer(
            data=request.data,
            context={'tenant_id': tenant_id}
        )
        serializer.is_valid(raise_exception=True)
        
        try:
            # Create sales voucher using business logic
            voucher = sales_flow.create_sales_voucher(
                serializer.validated_data,
                tenant_id,
                user_state
            )
            
            # Return created voucher
            output_serializer = SalesVoucherSerializer(voucher)
            return Response(output_serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def update_step(self, request, pk=None):
        """
        Update current step and step-specific data.
        
        POST /api/vouchers/sales/{id}/update_step/
        Body: {
            "step": 2,
            "payment_details": {...}  // optional, based on step
        }
        """
        tenant_id = get_tenant_from_request(request)
        step = request.data.get('step')
        
        if not step:
            return Response(
                {'error': 'Step number is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            voucher = sales_database.update_sales_voucher_step(
                pk,
                tenant_id,
                step,
                request.data
            )
            
            serializer = SalesVoucherSerializer(voucher)
            return Response(serializer.data)
            
        except SalesVoucher.DoesNotExist:
            return Response(
                {'error': 'Sales voucher not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """
        Mark sales voucher as completed.
        
        POST /api/vouchers/sales/{id}/complete/
        """
        tenant_id = get_tenant_from_request(request)
        
        try:
            voucher = sales_database.complete_sales_voucher(pk, tenant_id)
            serializer = SalesVoucherSerializer(voucher)
            return Response(serializer.data)
            
        except SalesVoucher.DoesNotExist:
            return Response(
                {'error': 'Sales voucher not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete by marking as cancelled"""
        tenant_id = get_tenant_from_request(request)
        
        try:
            sales_database.delete_sales_voucher(kwargs['pk'], tenant_id)
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        except SalesVoucher.DoesNotExist:
            return Response(
                {'error': 'Sales voucher not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class CustomerAddressAPIView(APIView):
    """
    API endpoint to fetch customer address details.
    
    GET /api/vouchers/sales/customer-address/{customer_id}/
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, customer_id):
        tenant_id = get_tenant_from_request(request)
        
        try:
            address_data = sales_flow.fetch_customer_address(customer_id, tenant_id)
            serializer = CustomerAddressSerializer(address_data)
            return Response(serializer.data)
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class TaxTypeDeterminationAPIView(APIView):
    """
    API endpoint to determine tax type based on addresses.
    
    POST /api/vouchers/sales/determine-tax-type/
    Body: {
        "user_state": "Tamil Nadu",
        "bill_to_state": "Karnataka",
        "bill_to_country": "India"
    }
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = TaxTypeDeterminationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        tax_type = sales_flow.determine_tax_type(
            serializer.validated_data['user_state'],
            serializer.validated_data['bill_to_state'],
            serializer.validated_data['bill_to_country']
        )
        
        return Response({'tax_type': tax_type})


class SalesDocumentUploadAPIView(APIView):
    """
    API endpoint to upload supporting documents for sales voucher.
    
    POST /api/vouchers/sales/upload-document/
    Form Data:
        - file: File to upload (JPG, JPEG, PDF only)
        - voucher_id: Optional sales voucher ID
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    
    def post(self, request):
        tenant_id = get_tenant_from_request(request)
        
        serializer = FileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        uploaded_file = serializer.validated_data['file']
        voucher_id = serializer.validated_data.get('voucher_id')
        
        try:
            # Validate file
            is_valid, file_type = sales_flow.validate_file_upload(
                uploaded_file.name,
                uploaded_file.size
            )
            
            # Save file to storage
            file_name = uploaded_file.name
            file_path = default_storage.save(
                f'sales_vouchers/{tenant_id}/{file_name}',
                ContentFile(uploaded_file.read())
            )
            
            # If voucher_id is provided, save document record
            if voucher_id:
                document = sales_database.save_voucher_document(
                    voucher_id,
                    tenant_id,
                    {
                        'file_name': file_name,
                        'file_path': file_path,
                        'file_type': file_type,
                        'file_size': uploaded_file.size
                    }
                )
                
                doc_serializer = SalesVoucherDocumentSerializer(document)
                return Response(doc_serializer.data, status=status.HTTP_201_CREATED)
            else:
                # Return file info for temporary storage
                return Response({
                    'file_name': file_name,
                    'file_path': file_path,
                    'file_type': file_type,
                    'file_size': uploaded_file.size
                }, status=status.HTTP_200_OK)
                
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class CustomerListAPIView(APIView):
    """
    API endpoint to fetch customer list for dropdown.
    
    GET /api/vouchers/sales/customers/
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        tenant_id = get_tenant_from_request(request)
        
        customers = sales_database.get_customers(tenant_id)
        
        # Return simplified customer data for dropdown
        customer_data = [
            {
                'id': customer.id,
                'name': customer.name,
                'gstin': customer.gstin or '',
                'state': customer.state or ''
            }
            for customer in customers
        ]
        
        return Response(customer_data)
