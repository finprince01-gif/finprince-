
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django.db import IntegrityError
import logging

from .models import VendorMasterProductService
from .vendorproduct_serializers import (
    VendorProductServiceSerializer,
    VendorProductServiceCreateSerializer,
    VendorProductServiceUpdateSerializer
)
from .vendorproduct_database import VendorProductServiceDatabase

logger = logging.getLogger(__name__)


class VendorProductServiceViewSet(viewsets.ModelViewSet):
    """ViewSet for Vendor Master Products and Services"""
    queryset = VendorMasterProductService.objects.all()
    serializer_class = VendorProductServiceSerializer
    permission_classes = [IsAuthenticated]
    
    def get_tenant_id(self):
        """Extract tenant_id from authenticated user"""
        user = self.request.user
        
        # specific check for AnonymousUser for development
        if user.is_anonymous:
            return 'default_tenant'
            
        if hasattr(user, 'tenant_id') and user.tenant_id:
            return user.tenant_id
        elif hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id') and user.tenant.tenant_id:
            return user.tenant.tenant_id
            
        # Fallback if user has ID but no tenant (unlikely in prod but possible in dev)
        return str(getattr(user, 'id', 'default_tenant')) or 'default_tenant'
    
    def get_queryset(self):
        """Filter queryset by tenant"""
        tenant_id = self.get_tenant_id()
        vendor_id = self.request.query_params.get('vendor_id') or self.request.query_params.get('vendor_basic_detail')
        queryset = VendorProductServiceDatabase.get_products_by_vendor(tenant_id, vendor_id)
        return queryset if queryset is not None else VendorMasterProductService.objects.none()

    def get_serializer_class(self):
        if self.action == 'create':
            return VendorProductServiceCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return VendorProductServiceUpdateSerializer
        return VendorProductServiceSerializer

    def create(self, request, *args, **kwargs):
        """Create a new product service item"""
        tenant_id = self.get_tenant_id()
        # Handle bulk create if list, or single create
        # But standard create is single. For bulk, we might need a custom action or iterate in frontend.
        # User requirement implies saving the table, likely one by one or list.
        # Let's support list creation for "Save" button if multiple items added.
        
        data = request.data
        if isinstance(data, list):
            serializer = self.get_serializer(data=data, many=True)
        else:
            serializer = self.get_serializer(data=data)
            
        if serializer.is_valid():
            try:
                if isinstance(data, list):
                    # Bulk create logic
                    created_items = []
                    for item_data in serializer.validated_data:
                        # Append vendor_basic_detail if missing from item but passed in context or URL?
                        # Assuming handled by serializer validation
                        item = VendorProductServiceDatabase.create_product_service(
                            tenant_id=tenant_id,
                            data=item_data,
                            created_by=request.user.username
                        )
                        created_items.append(item)
                    
                    return Response(
                        VendorProductServiceSerializer(created_items, many=True).data, 
                        status=status.HTTP_201_CREATED
                    )
                else:
                    # Single create
                    item = VendorProductServiceDatabase.create_product_service(
                        tenant_id=tenant_id,
                        data=serializer.validated_data,
                        created_by=request.user.username
                    )
                    return Response(
                        VendorProductServiceSerializer(item).data,
                        status=status.HTTP_201_CREATED
                    )
            except Exception as e:
                logger.error(f"Error creating product: {e}")
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def by_vendor(self, request):
        """Get products by vendor ID"""
        vendor_id = request.query_params.get('vendor_id')
        if not vendor_id:
            return Response({'error': 'vendor_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        tenant_id = self.get_tenant_id()
        products = VendorProductServiceDatabase.get_products_by_vendor(tenant_id, vendor_id)
        serializer = VendorProductServiceSerializer(products, many=True)
        return Response(serializer.data)
