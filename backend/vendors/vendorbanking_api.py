"""
API views for Vendor Master Banking Information.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
import logging

from .models import VendorMasterBanking
from .vendorbanking_serializers import VendorMasterBankingSerializer
from .vendorbanking_database import (
    create_vendor_banking,
    update_vendor_banking,
    get_vendor_banking_by_id,
    get_vendor_banking_by_vendor,
    list_vendor_banking_by_tenant,
    delete_vendor_banking,
)

logger = logging.getLogger(__name__)


class VendorMasterBankingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor Master Banking Information.
    
    Provides CRUD operations for vendor banking records.
    Supports multiple bank accounts per vendor.
    """
    queryset = VendorMasterBanking.objects.all()
    serializer_class = VendorMasterBankingSerializer
    permission_classes = [IsAuthenticated]
    
    def get_tenant_id(self):
        """Extract tenant_id from authenticated user"""
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            return user.tenant_id
        elif hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id'):
            return user.tenant.tenant_id
        return None

    def get_username(self):
        """Get username from request"""
        return self.request.user.username if hasattr(self.request.user, 'username') else 'system'

    def get_queryset(self):
        """Filter queryset by tenant_id from the authenticated user"""
        tenant_id = self.get_tenant_id()
        if tenant_id:
            return VendorMasterBanking.objects.filter(tenant_id=tenant_id)
        return VendorMasterBanking.objects.none()
    
    def create(self, request, *args, **kwargs):
        """
        Create a new vendor banking record.
        Supports bulk creation for multiple bank accounts.
        """
        try:
            tenant_id = self.get_tenant_id()
            username = self.get_username()
            
            if not tenant_id:
                return Response(
                    {"error": "User has no associated tenant"},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Check if data is a list (bulk creation) or single object
            is_bulk = isinstance(request.data, list)
            data_list = request.data if is_bulk else [request.data]
            
            created_records = []
            
            for data in data_list:
                data_copy = data.copy() if isinstance(data, dict) else data
                data_copy['tenant_id'] = tenant_id
                data_copy['created_by'] = username
                data_copy['updated_by'] = username
                
                # Validate data using serializer
                serializer = self.get_serializer(data=data_copy)
                serializer.is_valid(raise_exception=True)
                
                # Create using database function
                with transaction.atomic():
                    result = create_vendor_banking(data_copy)
                    created_records.append(result)
            
            # Return list if bulk, single object otherwise
            response_data = created_records if is_bulk else created_records[0]
            return Response(response_data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Error creating vendor banking: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def update(self, request, *args, **kwargs):
        """
        Update an existing vendor banking record.
        """
        try:
            banking_id = kwargs.get('pk')
            username = self.get_username()
            
            data = request.data.copy()
            data['updated_by'] = username
            
            # Validate data using serializer
            instance = self.get_object()
            serializer = self.get_serializer(instance, data=data, partial=True)
            serializer.is_valid(raise_exception=True)
            
            # Update using database function
            with transaction.atomic():
                result = update_vendor_banking(banking_id, data)
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error updating vendor banking: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def retrieve(self, request, *args, **kwargs):
        """
        Retrieve a vendor banking record by ID.
        """
        try:
            banking_id = kwargs.get('pk')
            result = get_vendor_banking_by_id(banking_id)
            
            if not result:
                return Response(
                    {"error": "Banking record not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error retrieving vendor banking: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def list(self, request, *args, **kwargs):
        """
        List all vendor banking records for the tenant.
        """
        try:
            tenant_id = self.get_tenant_id()
            
            if not tenant_id:
                return Response(
                    {"error": "User has no associated tenant"},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            results = list_vendor_banking_by_tenant(tenant_id)
            return Response(results, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error listing vendor banking: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def destroy(self, request, *args, **kwargs):
        """
        Soft delete a vendor banking record.
        """
        try:
            banking_id = kwargs.get('pk')
            
            with transaction.atomic():
                delete_vendor_banking(banking_id)
            
            return Response(
                {"message": "Banking record deleted successfully"},
                status=status.HTTP_204_NO_CONTENT
            )
            
        except Exception as e:
            logger.error(f"Error deleting vendor banking: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'], url_path='by-vendor/(?P<vendor_id>[^/.]+)')
    def by_vendor(self, request, vendor_id=None):
        """
        Get all banking records for a specific vendor.
        Ensures the vendor belongs to the tenant.
        """
        try:
            tenant_id = self.get_tenant_id()
            if not tenant_id:
                return Response({"error": "No tenant ID found"}, status=status.HTTP_403_FORBIDDEN)
                
            results = get_vendor_banking_by_vendor(vendor_id)
            
            # Filter results by tenant_id to ensure isolation
            filtered_results = [r for r in results if r.get('tenant_id') == tenant_id]
            
            return Response(filtered_results, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error getting vendor banking by vendor: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
