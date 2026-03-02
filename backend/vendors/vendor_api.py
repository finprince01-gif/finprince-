"""
API endpoints for Vendor management.
This module handles all API operations for vendors.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import IntegrityError

from .models import Vendor
from .vendor_serializers import (
    VendorSerializer,
    VendorCreateSerializer,
    VendorUpdateSerializer,
    VendorListSerializer,
    VendorSummarySerializer,
    VendorBalanceSerializer,
    VendorStatisticsSerializer
)
from .vendor_database import VendorDatabase


class VendorViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor management.
    
    Provides CRUD operations for vendors with tenant isolation.
    """
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated]
    
    def get_tenant_id(self):
        """Extract tenant_id from authenticated user"""
        user = self.request.user
        if hasattr(user, 'tenant_id'):
            return user.tenant_id
        elif hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id'):
            return user.tenant.tenant_id
        else:
            # Fallback for development/testing
            return getattr(user, 'id', 'default_tenant')
    
    def get_username(self):
        """Get username from request"""
        return self.request.user.username if hasattr(self.request.user, 'username') else None
    
    def get_queryset(self):
        """Filter queryset by tenant and apply filters"""
        tenant_id = self.get_tenant_id()
        
        # Get query parameters
        is_active = self.request.query_params.get('is_active')
        vendor_type = self.request.query_params.get('vendor_type')
        category_id = self.request.query_params.get('category_id')
        is_verified = self.request.query_params.get('is_verified')
        search = self.request.query_params.get('search')
        
        # Build filters
        filters = {}
        if vendor_type:
            filters['vendor_type'] = vendor_type
        if category_id:
            filters['category_id'] = category_id
        if is_verified is not None:
            filters['is_verified'] = is_verified.lower() == 'true'
        
        # Handle is_active filter
        active_filter = None if is_active is None else (is_active.lower() == 'true')
        
        # Search or filter
        if search:
            return VendorDatabase.search_vendors(tenant_id, search)
        else:
            return VendorDatabase.get_vendors_by_tenant(tenant_id, active_filter, filters)
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return VendorCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return VendorUpdateSerializer
        elif self.action == 'list':
            # Check if summary is requested
            if self.request.query_params.get('summary') == 'true':
                return VendorSummarySerializer
            return VendorListSerializer
        return VendorSerializer
    
    def create(self, request, *args, **kwargs):
        """
        Create a new vendor.
        
        Expected payload:
        {
            "vendor_name": "ABC Suppliers",
            "vendor_code": "VEN00001",  // Optional, auto-generated if not provided
            "vendor_type": "supplier",
            "email": "contact@abc.com",
            "phone": "1234567890",
            ...
        }
        """
        tenant_id = self.get_tenant_id()
        username = self.get_username()
        serializer = self.get_serializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for duplicate vendor code if provided
        vendor_code = serializer.validated_data.get('vendor_code')
        if vendor_code and VendorDatabase.check_duplicate_vendor_code(tenant_id, vendor_code):
            return Response(
                {'error': f'Vendor code "{vendor_code}" already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for duplicate email
        email = serializer.validated_data.get('email')
        if email and VendorDatabase.check_duplicate_email(tenant_id, email):
            return Response(
                {'error': f'Email "{email}" is already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Prepare data
            vendor_data = serializer.validated_data.copy()
            
            # Handle category
            if 'category' in vendor_data:
                category = vendor_data.pop('category')
                vendor_data['category_id'] = category.id if category else None
            
            vendor = VendorDatabase.create_vendor(
                tenant_id=tenant_id,
                vendor_data=vendor_data,
                created_by=username
            )
            
            response_serializer = VendorSerializer(vendor)
            return Response(
                response_serializer.data,
                status=status.HTTP_201_CREATED
            )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except IntegrityError as e:
            return Response(
                {'error': 'Database integrity error', 'details': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def update(self, request, *args, **kwargs):
        """Update an existing vendor"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        username = self.get_username()
        
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for duplicate email (excluding current vendor)
        email = serializer.validated_data.get('email', instance.email)
        if email and VendorDatabase.check_duplicate_email(
            instance.tenant_id, email, exclude_id=instance.id
        ):
            return Response(
                {'error': f'Email "{email}" is already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            update_data = serializer.validated_data.copy()
            
            # Handle category
            if 'category' in update_data:
                category = update_data.pop('category')
                update_data['category_id'] = category.id if category else None
            
            updated_vendor = VendorDatabase.update_vendor(
                instance.id,
                update_data,
                updated_by=username
            )
            
            if updated_vendor:
                response_serializer = VendorSerializer(updated_vendor)
                return Response(response_serializer.data)
            else:
                return Response(
                    {'error': 'Vendor not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete a vendor"""
        instance = self.get_object()
        success = VendorDatabase.delete_vendor(instance.id, soft_delete=True)
        
        if success:
            return Response(
                {'message': 'Vendor deactivated successfully'},
                status=status.HTTP_204_NO_CONTENT
            )
        else:
            return Response(
                {'error': 'Vendor not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def update_balance(self, request, pk=None):
        """
        Update vendor balance.
        
        POST /api/vendors/{id}/update_balance/
        {
            "amount": 1000.00,
            "operation": "add"  // or "subtract"
        }
        """
        vendor = self.get_object()
        serializer = VendorBalanceSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        amount = serializer.validated_data['amount']
        operation = serializer.validated_data['operation']
        
        try:
            updated_vendor = VendorDatabase.update_vendor_balance(
                vendor.id,
                amount,
                operation
            )
            
            if updated_vendor:
                response_serializer = VendorSerializer(updated_vendor)
                return Response(response_serializer.data)
            else:
                return Response(
                    {'error': 'Failed to update balance'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """
        Get vendor statistics for the tenant.
        
        GET /api/vendors/statistics/
        """
        tenant_id = self.get_tenant_id()
        stats = VendorDatabase.get_vendor_statistics(tenant_id)
        serializer = VendorStatisticsSerializer(stats)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """
        Get vendors filtered by category.
        
        GET /api/vendors/by_category/?category_id={id}
        """
        category_id = request.query_params.get('category_id')
        if not category_id:
            return Response(
                {'error': 'category_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        tenant_id = self.get_tenant_id()
        vendors = VendorDatabase.get_vendors_by_category(tenant_id, category_id)
        
        serializer = VendorListSerializer(vendors, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def outstanding(self, request):
        """
        Get vendors with outstanding balance.
        
        GET /api/vendors/outstanding/?min_balance=1000
        """
        min_balance = request.query_params.get('min_balance', 0)
        try:
            min_balance = float(min_balance)
        except ValueError:
            min_balance = 0
        
        tenant_id = self.get_tenant_id()
        vendors = VendorDatabase.get_vendors_with_outstanding_balance(
            tenant_id,
            min_balance
        )
        
        serializer = VendorListSerializer(vendors, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """
        Verify a vendor.
        
        POST /api/vendors/{id}/verify/
        """
        vendor = self.get_object()
        username = self.get_username()
        
        updated_vendor = VendorDatabase.update_vendor(
            vendor.id,
            {'is_verified': True},
            updated_by=username
        )
        
        if updated_vendor:
            response_serializer = VendorSerializer(updated_vendor)
            return Response(response_serializer.data)
        else:
            return Response(
                {'error': 'Failed to verify vendor'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Activate a vendor.
        
        POST /api/vendors/{id}/activate/
        """
        vendor = self.get_object()
        username = self.get_username()
        
        updated_vendor = VendorDatabase.update_vendor(
            vendor.id,
            {'is_active': True},
            updated_by=username
        )
        
        if updated_vendor:
            response_serializer = VendorSerializer(updated_vendor)
            return Response(response_serializer.data)
        else:
            return Response(
                {'error': 'Failed to activate vendor'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """
        Deactivate a vendor.
        
        POST /api/vendors/{id}/deactivate/
        """
        vendor = self.get_object()
        username = self.get_username()
        
        updated_vendor = VendorDatabase.update_vendor(
            vendor.id,
            {'is_active': False},
            updated_by=username
        )
        
        if updated_vendor:
            response_serializer = VendorSerializer(updated_vendor)
            return Response(response_serializer.data)
        else:
            return Response(
                {'error': 'Failed to deactivate vendor'},
                status=status.HTTP_400_BAD_REQUEST
            )
