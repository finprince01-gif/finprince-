"""
API endpoints for Vendor Master PO Settings.
This module handles all API operations for PO settings.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db import IntegrityError
import logging

from .models import VendorMasterPOSettings
from .posettings_serializers import (
    VendorMasterPOSettingsSerializer,
    VendorMasterPOSettingsCreateSerializer,
    VendorMasterPOSettingsUpdateSerializer
)
from .posettings_database import POSettingsDatabase

logger = logging.getLogger(__name__)


class VendorMasterPOSettingsViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor Master PO Settings.
    
    Provides CRUD operations for PO settings with tenant isolation.
    """
    queryset = VendorMasterPOSettings.objects.all()
    serializer_class = VendorMasterPOSettingsSerializer
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
    
    def get_queryset(self):
        """Filter queryset by tenant"""
        tenant_id = self.get_tenant_id()
        return POSettingsDatabase.get_po_settings_by_tenant(tenant_id)
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return VendorMasterPOSettingsCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return VendorMasterPOSettingsUpdateSerializer
        return VendorMasterPOSettingsSerializer
    
    def create(self, request, *args, **kwargs):
        """
        Create a new PO setting.
        
        Expected payload:
        {
            "name": "Standard PO",
            "category": 1,  // Optional category ID
            "prefix": "PO/",
            "suffix": "/24-25",
            "digits": 4,
            "auto_year": false
        }
        """
        logger.info(f"=== PO Settings CREATE Request ===")
        logger.info(f"Request data: {request.data}")
        logger.info(f"Request user: {request.user}")
        
        tenant_id = self.get_tenant_id()
        logger.info(f"Tenant ID: {tenant_id}")
        
        serializer = self.get_serializer(data=request.data)
        
        if not serializer.is_valid():
            logger.error(f"Serializer validation failed: {serializer.errors}")
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        logger.info(f"Serializer validated data: {serializer.validated_data}")
        
        # Check for duplicate name
        name = serializer.validated_data.get('name')
        if POSettingsDatabase.check_duplicate_name(tenant_id, name):
            logger.warning(f"Duplicate name detected: {name}")
            return Response(
                {'error': f'PO setting with name "{name}" already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            category_id = serializer.validated_data.get('category')
            if category_id:
                category_id = category_id.id
            
            logger.info(f"Creating PO setting with tenant_id={tenant_id}, name={name}")
            
            po_setting = POSettingsDatabase.create_po_setting(
                tenant_id=tenant_id,
                name=serializer.validated_data.get('name'),
                category_id=category_id,
                prefix=serializer.validated_data.get('prefix'),
                suffix=serializer.validated_data.get('suffix'),
                digits=serializer.validated_data.get('digits', 4),
                auto_year=serializer.validated_data.get('auto_year', False)
            )
            
            logger.info(f"✅ PO setting created successfully! ID: {po_setting.id}")
            
            response_serializer = VendorMasterPOSettingsSerializer(po_setting)
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
        """Update an existing PO setting"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        tenant_id = self.get_tenant_id()
        
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for duplicate name (excluding current instance)
        name = serializer.validated_data.get('name', instance.name)
        if POSettingsDatabase.check_duplicate_name(tenant_id, name, exclude_id=instance.id):
            return Response(
                {'error': f'PO setting with name "{name}" already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            update_data = serializer.validated_data.copy()
            
            # Handle category
            if 'category' in update_data:
                category = update_data.pop('category')
                update_data['category_id'] = category.id if category else None
            
            updated_instance = POSettingsDatabase.update_po_setting(
                instance.id,
                **update_data
            )
            
            if updated_instance:
                response_serializer = VendorMasterPOSettingsSerializer(updated_instance)
                return Response(response_serializer.data)
            else:
                return Response(
                    {'error': 'PO setting not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete a PO setting"""
        instance = self.get_object()
        success = POSettingsDatabase.delete_po_setting(instance.id, soft_delete=True)
        
        if success:
            return Response(
                {'message': 'PO setting deactivated successfully'},
                status=status.HTTP_204_NO_CONTENT
            )
        else:
            return Response(
                {'error': 'PO setting not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def generate_po_number(self, request, pk=None):
        """
        Generate the next PO number for this setting.
        
        This increments the current_number and returns the formatted PO number.
        """
        try:
            po_number = POSettingsDatabase.increment_po_number(pk)
            return Response({
                'po_number': po_number,
                'message': 'PO number generated successfully'
            })
        except VendorMasterPOSettings.DoesNotExist:
            return Response(
                {'error': 'PO setting not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['get'])
    def preview_po_number(self, request, pk=None):
        """
        Preview the next PO number without incrementing.
        """
        instance = self.get_object()
        po_number = instance.generate_po_number()
        return Response({
            'preview': po_number,
            'current_number': instance.current_number
        })
    
    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """
        Get PO settings filtered by category.
        
        Query params:
            category_id: ID of the category to filter by
        """
        category_id = request.query_params.get('category_id')
        if not category_id:
            return Response(
                {'error': 'category_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        tenant_id = self.get_tenant_id()
        po_settings = POSettingsDatabase.get_po_settings_by_category(
            tenant_id,
            category_id
        )
        
        serializer = VendorMasterPOSettingsSerializer(po_settings, many=True)
        return Response(serializer.data)
