"""
API endpoints for Vendor Master Basic Details.
This module handles all API operations for vendor basic details.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import IntegrityError
import logging

from .models import VendorMasterBasicDetail
from .vendorbasicdetail_serializers import (
    VendorBasicDetailSerializer,
    VendorBasicDetailCreateSerializer,
    VendorBasicDetailUpdateSerializer,
    VendorBasicDetailListSerializer,
    VendorBasicDetailSummarySerializer,
    VendorBasicDetailStatisticsSerializer
)
from .vendorbasicdetail_database import VendorBasicDetailDatabase

logger = logging.getLogger(__name__)


class VendorBasicDetailViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor Master Basic Details.
    
    Provides CRUD operations for vendor basic details with tenant isolation.
    """

    queryset = VendorMasterBasicDetail.objects.all()
    serializer_class = VendorBasicDetailSerializer
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
        search = self.request.query_params.get('search')
        
        # Handle is_active filter
        active_filter = None if is_active is None else (is_active.lower() == 'true')
        
        # Search or filter
        if search:
            return VendorBasicDetailDatabase.search_vendors_basic_detail(tenant_id, search)
        else:
            return VendorBasicDetailDatabase.get_vendors_basic_detail_by_tenant(tenant_id, active_filter)
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return VendorBasicDetailCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return VendorBasicDetailUpdateSerializer
        elif self.action == 'list':
            # Check if summary is requested
            if self.request.query_params.get('summary') == 'true':
                return VendorBasicDetailSummarySerializer
            return VendorBasicDetailListSerializer
        return VendorBasicDetailSerializer
    
    def create(self, request, *args, **kwargs):
        """
        Create a new vendor basic detail.
        
        Expected payload:
        {
            "vendor_code": "VEN0001",  // Optional, auto-generated if not provided
            "vendor_name": "ABC Suppliers",
            "pan_no": "ABCDE1234F",
            "contact_person": "John Doe",
            "email": "contact@abc.com",
            "contact_no": "+91 9876543210",
            "is_also_customer": false
        }
        """
        logger.info(f"=== Vendor Basic Detail CREATE Request ===")
        logger.info(f"Request data: {request.data}")
        logger.info(f"Request user: {request.user}")
        
        tenant_id = self.get_tenant_id()
        username = self.get_username()
        logger.info(f"Tenant ID: {tenant_id}")
        
        serializer = self.get_serializer(data=request.data)
        
        if not serializer.is_valid():
            logger.error(f"Serializer validation failed: {serializer.errors}")
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        logger.info(f"Serializer validated data: {serializer.validated_data}")
        
        # Check for duplicate vendor code if provided
        vendor_code = serializer.validated_data.get('vendor_code')
        if vendor_code and VendorBasicDetailDatabase.check_duplicate_vendor_code(tenant_id, vendor_code):
            logger.warning(f"Duplicate vendor code detected: {vendor_code}")
            return Response(
                {'error': f'Vendor code "{vendor_code}" already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for duplicate email
        email = serializer.validated_data.get('email')
        if email and VendorBasicDetailDatabase.check_duplicate_email(tenant_id, email):
            logger.warning(f"Duplicate email detected: {email}")
            return Response(
                {'error': f'Email "{email}" is already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for duplicate PAN
        pan_no = serializer.validated_data.get('pan_no')
        if pan_no and VendorBasicDetailDatabase.check_duplicate_pan(tenant_id, pan_no):
            logger.warning(f"Duplicate PAN detected: {pan_no}")
            return Response(
                {'error': f'PAN "{pan_no}" is already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            logger.info(f"Creating vendor basic detail with tenant_id={tenant_id}")
            
            vendor = VendorBasicDetailDatabase.create_vendor_basic_detail(
                tenant_id=tenant_id,
                vendor_data=serializer.validated_data,
                created_by=username
            )
            
            logger.info(f"✅ Vendor basic detail created successfully! ID: {vendor.id}, Code: {vendor.vendor_code}")
            
            response_serializer = VendorBasicDetailSerializer(vendor)
            return Response(
                response_serializer.data,
                status=status.HTTP_201_CREATED
            )
        except ValueError as e:
            logger.error(f"ValueError during creation: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except IntegrityError as e:
            logger.error(f"IntegrityError during creation: {e}")
            return Response(
                {'error': 'Database integrity error', 'details': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Unexpected error during creation: {e}", exc_info=True)
            return Response(
                {'error': 'Unexpected error', 'details': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def update(self, request, *args, **kwargs):
        """Update an existing vendor basic detail"""
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
        if email and VendorBasicDetailDatabase.check_duplicate_email(
            instance.tenant_id, email, exclude_id=instance.id
        ):
            return Response(
                {'error': f'Email "{email}" is already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for duplicate PAN (excluding current vendor)
        pan_no = serializer.validated_data.get('pan_no', instance.pan_no)
        if pan_no and VendorBasicDetailDatabase.check_duplicate_pan(
            instance.tenant_id, pan_no, exclude_id=instance.id
        ):
            return Response(
                {'error': f'PAN "{pan_no}" is already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            updated_vendor = VendorBasicDetailDatabase.update_vendor_basic_detail(
                instance.id,
                serializer.validated_data,
                updated_by=username
            )
            
            if updated_vendor:
                response_serializer = VendorBasicDetailSerializer(updated_vendor)
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
        """Soft delete a vendor basic detail"""
        instance = self.get_object()
        success = VendorBasicDetailDatabase.delete_vendor_basic_detail(instance.id, soft_delete=True)
        
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
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """
        Get vendor basic detail statistics for the tenant.
        
        GET /api/vendors/basic-details/statistics/
        """
        tenant_id = self.get_tenant_id()
        stats = VendorBasicDetailDatabase.get_vendor_statistics(tenant_id)
        serializer = VendorBasicDetailStatisticsSerializer(stats)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def generate_code(self, request):
        """
        Generate a new vendor code.
        
        POST /api/vendors/basic-details/generate_code/
        """
        tenant_id = self.get_tenant_id()
        vendor_code = VendorBasicDetailDatabase.generate_vendor_code(tenant_id)
        return Response({'vendor_code': vendor_code})
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Activate a vendor.
        
        POST /api/vendors/basic-details/{id}/activate/
        """
        vendor = self.get_object()
        username = self.get_username()
        
        updated_vendor = VendorBasicDetailDatabase.update_vendor_basic_detail(
            vendor.id,
            {'is_active': True},
            updated_by=username
        )
        
        if updated_vendor:
            response_serializer = VendorBasicDetailSerializer(updated_vendor)
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
        
        POST /api/vendors/basic-details/{id}/deactivate/
        """
        vendor = self.get_object()
        username = self.get_username()
        
        updated_vendor = VendorBasicDetailDatabase.update_vendor_basic_detail(
            vendor.id,
            {'is_active': False},
            updated_by=username
        )
        
        if updated_vendor:
            response_serializer = VendorBasicDetailSerializer(updated_vendor)
            return Response(response_serializer.data)
        else:
            return Response(
                {'error': 'Failed to deactivate vendor'},
                status=status.HTTP_400_BAD_REQUEST
            )
