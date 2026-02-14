"""
API endpoints for Vendor Master GST Details.
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import IntegrityError
import logging

from .models import VendorMasterGSTDetails
from .vendorgstdetails_serializers import (
    VendorGSTDetailsSerializer,
    VendorGSTDetailsCreateSerializer,
    VendorGSTDetailsUpdateSerializer,
    VendorGSTDetailsListSerializer
)
from .vendorgstdetails_database import VendorGSTDetailsDatabase

logger = logging.getLogger(__name__)


class VendorGSTDetailsViewSet(viewsets.ModelViewSet):
    """ViewSet for Vendor Master GST Details"""
    queryset = VendorMasterGSTDetails.objects.all()
    serializer_class = VendorGSTDetailsSerializer
    permission_classes = [IsAuthenticated]

    
    def get_tenant_id(self):
        """Extract tenant_id from authenticated user"""
        user = self.request.user
        
        # specific check for AnonymousUser
        if user.is_anonymous:
            return 'default_tenant'
            
        if hasattr(user, 'tenant_id') and user.tenant_id:
            return user.tenant_id
        elif hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id') and user.tenant.tenant_id:
            return user.tenant.tenant_id
            
        # Fallback if user has ID but no tenant (unlikely in prod but possible in dev)
        return str(getattr(user, 'id', 'default_tenant')) or 'default_tenant'
    
    def get_username(self):
        """Get username from request"""
        return self.request.user.username if hasattr(self.request.user, 'username') else None
    
    def get_queryset(self):
        """Filter queryset by tenant"""
        tenant_id = self.get_tenant_id()
        is_active = self.request.query_params.get('is_active')
        active_filter = None if is_active is None else (is_active.lower() == 'true')
        vendor_id = self.request.query_params.get('vendor_basic_detail')
        return VendorGSTDetailsDatabase.get_gst_details_by_tenant(tenant_id, active_filter, vendor_id)
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return VendorGSTDetailsCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return VendorGSTDetailsUpdateSerializer
        elif self.action == 'list':
            return VendorGSTDetailsListSerializer
        return VendorGSTDetailsSerializer
    
    def create(self, request, *args, **kwargs):
        """Create a new vendor GST detail"""
        logger.info(f"=== Vendor GST Detail CREATE Request ===")
        logger.info(f"Request data: {request.data}")
        
        tenant_id = self.get_tenant_id()
        username = self.get_username()
        
        serializer = self.get_serializer(data=request.data)
        
        if not serializer.is_valid():
            logger.error(f"Serializer validation failed: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        # Check for duplicate GSTIN + Reference Name
        gstin = serializer.validated_data.get('gstin')
        reference_name = serializer.validated_data.get('reference_name')
        if VendorGSTDetailsDatabase.check_duplicate_gstin(tenant_id, gstin, reference_name):
            logger.warning(f"Duplicate GSTIN/Reference Name detected: {gstin} / {reference_name}")
            return Response(
                {'error': f'GSTIN "{gstin}" with branch "{reference_name}" is already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            gst_detail = VendorGSTDetailsDatabase.create_gst_detail(
                tenant_id=tenant_id,
                gst_data=serializer.validated_data,
                created_by=username
            )
            
            logger.info(f"✅ GST detail created successfully! ID: {gst_detail.id}, GSTIN: {gst_detail.gstin}")
            
            response_serializer = VendorGSTDetailsSerializer(gst_detail)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
            
        except ValueError as e:
            logger.error(f"ValueError during creation: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
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
        """Update an existing vendor GST detail"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        username = self.get_username()
        
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            updated_gst = VendorGSTDetailsDatabase.update_gst_detail(
                instance.id,
                serializer.validated_data,
                updated_by=username
            )
            
            if updated_gst:
                response_serializer = VendorGSTDetailsSerializer(updated_gst)
                return Response(response_serializer.data)
            else:
                return Response({'error': 'GST detail not found'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete a vendor GST detail"""
        instance = self.get_object()
        success = VendorGSTDetailsDatabase.delete_gst_detail(instance.id, soft_delete=True)
        
        if success:
            return Response(
                {'message': 'GST detail deactivated successfully'},
                status=status.HTTP_204_NO_CONTENT
            )
        else:
            return Response({'error': 'GST detail not found'}, status=status.HTTP_404_NOT_FOUND)
