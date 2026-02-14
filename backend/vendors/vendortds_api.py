"""
API views for Vendor Master TDS & Other Statutory Details.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
import logging

from .models import VendorMasterTDS
from .vendortds_serializers import VendorMasterTDSSerializer
from .vendortds_database import (
    create_vendor_tds,
    update_vendor_tds,
    get_vendor_tds_by_id,
    get_vendor_tds_by_vendor,
    list_vendor_tds_by_tenant,
    delete_vendor_tds,
)

logger = logging.getLogger(__name__)


class VendorMasterTDSViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor Master TDS & Other Statutory Details.
    
    Provides CRUD operations for vendor TDS records.
    """
    queryset = VendorMasterTDS.objects.all()
    serializer_class = VendorMasterTDSSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter queryset by tenant_id from the authenticated user"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        
        if tenant_id:
            return VendorMasterTDS.objects.filter(tenant_id=tenant_id)
        return VendorMasterTDS.objects.none()
    
    def create(self, request, *args, **kwargs):
        """
        Create a new vendor TDS record.
        """
        try:
            user = request.user
            tenant_id = getattr(user, 'tenant_id', None)
            
            if not tenant_id:
                return Response(
                    {"error": "User has no associated tenant"},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            data = request.data.copy()
            data['tenant_id'] = tenant_id
            data['created_by'] = user.username
            data['updated_by'] = user.username
            
            # Validate data using serializer
            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            
            # Create using serializer
            with transaction.atomic():
                instance = serializer.save()
            
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Error creating vendor TDS: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def update(self, request, *args, **kwargs):
        """
        Update an existing vendor TDS record.
        """
        try:
            tds_id = kwargs.get('pk')
            user = request.user
            
            data = request.data.copy()
            data['updated_by'] = user.username
            
            # Validate data using serializer
            instance = self.get_object()
            serializer = self.get_serializer(instance, data=data, partial=True)
            serializer.is_valid(raise_exception=True)
            
            # Update using serializer
            with transaction.atomic():
                instance = serializer.save()
            
            return Response(serializer.data, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error updating vendor TDS: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def retrieve(self, request, *args, **kwargs):
        """
        Retrieve a vendor TDS record by ID.
        """
        try:
            tds_id = kwargs.get('pk')
            result = get_vendor_tds_by_id(tds_id)
            
            if not result:
                return Response(
                    {"error": "TDS record not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error retrieving vendor TDS: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def list(self, request, *args, **kwargs):
        """
        List all vendor TDS records for the tenant.
        """
        try:
            user = request.user
            tenant_id = getattr(user, 'tenant_id', None)
            
            if not tenant_id:
                return Response(
                    {"error": "User has no associated tenant"},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            results = list_vendor_tds_by_tenant(tenant_id)
            return Response(results, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error listing vendor TDS: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def destroy(self, request, *args, **kwargs):
        """
        Soft delete a vendor TDS record.
        """
        try:
            tds_id = kwargs.get('pk')
            
            with transaction.atomic():
                delete_vendor_tds(tds_id)
            
            return Response(
                {"message": "TDS record deleted successfully"},
                status=status.HTTP_204_NO_CONTENT
            )
            
        except Exception as e:
            logger.error(f"Error deleting vendor TDS: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'], url_path='by-vendor/(?P<vendor_id>[^/.]+)')
    def by_vendor(self, request, vendor_id=None):
        """
        Get TDS record by vendor basic detail ID.
        Returns empty object if no record found (normal for new vendors).
        """
        try:
            result = get_vendor_tds_by_vendor(vendor_id)
            
            if not result:
                # Return empty object instead of 404 for new vendors
                return Response(
                    {},
                    status=status.HTTP_200_OK
                )
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error getting vendor TDS by vendor: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

