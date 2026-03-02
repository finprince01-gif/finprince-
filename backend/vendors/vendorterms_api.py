"""
API endpoints for Vendor Master Terms & Conditions
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import PermissionDenied

from .models import VendorMasterTerms
from .vendorterms_serializers import VendorMasterTermsSerializer
from . import vendorterms_database as db


class VendorMasterTermsViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor Master Terms & Conditions
    
    Endpoints:
    - GET /api/vendors/terms/ - List all terms
    - POST /api/vendors/terms/ - Create new terms
    - GET /api/vendors/terms/{id}/ - Get specific terms
    - PUT /api/vendors/terms/{id}/ - Update terms
    - DELETE /api/vendors/terms/{id}/ - Delete terms
    - GET /api/vendors/terms/by_vendor/{vendor_id}/ - Get terms by vendor
    """
    
    queryset = VendorMasterTerms.objects.all()
    serializer_class = VendorMasterTermsSerializer
    permission_classes = [IsAuthenticated]
    
    def get_tenant_id(self, request):
        """Extract tenant_id from the authenticated user"""
        user = request.user
        
        # Check if user has tenant_id attribute
        if hasattr(user, 'tenant_id'):
            return str(user.tenant_id)
        
        # If not, raise an error
        raise PermissionDenied("User has no associated tenant")
    
    def list(self, request):
        """
        List all vendor terms for the tenant
        """
        try:
            tenant_id = self.get_tenant_id(request)
            terms_list = db.get_all_vendor_terms(tenant_id)
            
            return Response({
                'success': True,
                'data': terms_list,
                'count': len(terms_list)
            }, status=status.HTTP_200_OK)
            
        except PermissionDenied as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def create(self, request):
        """
        Create new vendor terms
        """
        try:
            tenant_id = self.get_tenant_id(request)
            data = request.data
            
            # Validate required fields
            if 'vendor_basic_detail' not in data:
                return Response({
                    'success': False,
                    'error': 'vendor_basic_detail is required'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Create terms
            terms_id = db.create_vendor_terms(
                tenant_id=tenant_id,
                vendor_basic_detail_id=data['vendor_basic_detail'],
                credit_limit=data.get('credit_limit'),
                credit_period=data.get('credit_period'),
                credit_terms=data.get('credit_terms'),
                penalty_terms=data.get('penalty_terms'),
                delivery_terms=data.get('delivery_terms'),
                warranty_guarantee_details=data.get('warranty_guarantee_details'),
                force_majeure=data.get('force_majeure'),
                dispute_redressal_terms=data.get('dispute_redressal_terms'),
                created_by=request.user.username if hasattr(request.user, 'username') else None
            )
            
            # Fetch the created terms
            created_terms = db.get_vendor_terms_by_id(terms_id)
            
            return Response({
                'success': True,
                'message': 'Vendor terms created successfully',
                'data': created_terms
            }, status=status.HTTP_201_CREATED)
            
        except PermissionDenied as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def retrieve(self, request, pk=None):
        """
        Get specific vendor terms by ID
        """
        try:
            terms = db.get_vendor_terms_by_id(pk)
            
            if not terms:
                return Response({
                    'success': False,
                    'error': 'Terms not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            return Response({
                'success': True,
                'data': terms
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def update(self, request, pk=None):
        """
        Update vendor terms
        """
        try:
            data = request.data
            
            # Update terms
            success = db.update_vendor_terms(
                terms_id=pk,
                credit_limit=data.get('credit_limit'),
                credit_period=data.get('credit_period'),
                credit_terms=data.get('credit_terms'),
                penalty_terms=data.get('penalty_terms'),
                delivery_terms=data.get('delivery_terms'),
                warranty_guarantee_details=data.get('warranty_guarantee_details'),
                force_majeure=data.get('force_majeure'),
                dispute_redressal_terms=data.get('dispute_redressal_terms'),
                updated_by=request.user.username if hasattr(request.user, 'username') else None
            )
            
            if not success:
                return Response({
                    'success': False,
                    'error': 'Terms not found or update failed'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Fetch updated terms
            updated_terms = db.get_vendor_terms_by_id(pk)
            
            return Response({
                'success': True,
                'message': 'Vendor terms updated successfully',
                'data': updated_terms
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """
        Delete vendor terms (soft delete)
        """
        try:
            success = db.delete_vendor_terms(pk)
            
            if not success:
                return Response({
                    'success': False,
                    'error': 'Terms not found or delete failed'
                }, status=status.HTTP_404_NOT_FOUND)
            
            return Response({
                'success': True,
                'message': 'Vendor terms deleted successfully'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'], url_path='by_vendor/(?P<vendor_id>[^/.]+)')
    def by_vendor(self, request, vendor_id=None):
        """
        Get all terms for a specific vendor
        """
        try:
            terms_list = db.get_vendor_terms_by_vendor(vendor_id)
            
            return Response({
                'success': True,
                'data': terms_list,
                'count': len(terms_list)
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
