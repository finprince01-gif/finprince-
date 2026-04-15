"""
API endpoints for Vendor Purchase Order Transactions
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import PermissionDenied

from .models import VendorTransactionPO, VendorTransactionPOItem
from .vendorpo_serializers import VendorPOSerializer, VendorPOCreateSerializer, VendorPOItemSerializer
from . import vendorpo_database as db


class VendorPOViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor Purchase Orders
    
    Endpoints:
    - GET /api/vendors/purchase-orders/ - List all POs
    - POST /api/vendors/purchase-orders/ - Create new PO
    - GET /api/vendors/purchase-orders/{id}/ - Get specific PO
    - PUT /api/vendors/purchase-orders/{id}/ - Update PO
    - DELETE /api/vendors/purchase-orders/{id}/ - Delete PO
    - POST /api/vendors/purchase-orders/{id}/update_status/ - Update PO status
    """
    
    queryset = VendorTransactionPO.objects.all()
    serializer_class = VendorPOSerializer
    permission_classes = [IsAuthenticated]
    
    def get_tenant_id(self, request):
        """Extract tenant_id from the authenticated user"""
        user = request.user
        tid = getattr(user, 'tenant_id', None) or getattr(user, 'branch_id', None)
        
        if tid:
            return str(tid)
        
        # If not, raise an error
        raise PermissionDenied("User has no associated tenant")
    
    def list(self, request):
        """
        List all purchase orders for the tenant
        """
        try:
            tenant_id = self.get_tenant_id(request)
            status_filter = request.query_params.get('status')
            vendor_name = request.query_params.get('vendor_name')
            
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"[VendorPOViewSet] Listing POs. tenant_id={tenant_id}, status={status_filter}, vendor_name={vendor_name}")
            
            po_list = db.get_all_purchase_orders(tenant_id, status_filter, vendor_name)
            logger.info(f"[VendorPOViewSet] Found {len(po_list)} POs")
            
            return Response({
                'success': True,
                'data': po_list,
                'count': len(po_list)
            }, status=status.HTTP_200_OK)
           
        except PermissionDenied as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def create(self, request):
        """
        Create new purchase order with items
        """
        try:
            tenant_id = self.get_tenant_id(request)
            data = request.data
            
            # Validate using serializer
            serializer = VendorPOCreateSerializer(data=data)
            if not serializer.is_valid():
                return Response({
                    'success': False,
                    'errors': serializer.errors
                }, status=status.HTTP_400_BAD_REQUEST)
            
            validated_data = serializer.validated_data
            
            # Extract PO data and items
            items_data = validated_data.pop('items', [])
            
            # Create PO
            try:


                
                po_id = db.create_purchase_order(
                    tenant_id=tenant_id,
                    po_data=validated_data,
                    items_data=items_data,
                    created_by=request.user.username if hasattr(request.user, 'username') else None
                )
                

                
            except Exception as e:
                import traceback


                raise
            
            # Fetch the created PO
            created_po = db.get_purchase_order_by_id(po_id)
            
            return Response({
                'success': True,
                'message': 'Purchase Order created successfully',
                'data': created_po
            }, status=status.HTTP_201_CREATED)
            
        except PermissionDenied as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            import traceback
            traceback.print_exc()
            with open('err.txt', 'w') as f2: f2.write(str(e) + '\n' + traceback.format_exc())
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def retrieve(self, request, pk=None):
        """
        Get specific purchase order by ID
        """
        try:
            po = db.get_purchase_order_by_id(pk)
            
            if not po:
                return Response({
                    'success': False,
                    'error': 'Purchase Order not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            return Response({
                'success': True,
                'data': po
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """
        Update PO status
        """
        try:
            new_status = request.data.get('status')
            
            if not new_status:
                return Response({
                    'success': False,
                    'error': 'Status is required'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            success = db.update_po_status(
                po_id=pk,
                status=new_status,
                updated_by=request.user.username if hasattr(request.user, 'username') else None
            )
            
            if not success:
                return Response({
                    'success': False,
                    'error': 'Purchase Order not found or update failed'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Fetch updated PO
            updated_po = db.get_purchase_order_by_id(pk)
            
            return Response({
                'success': True,
                'message': f'PO status updated to {new_status}',
                'data': updated_po
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_pending_pos(request):
    """
    Get all pending purchase orders for a specific vendor
    Query Parameter: vendor_id
    """
    try:
        user = request.user
        tenant_id = getattr(user, 'tenant_id', None) or getattr(user, 'branch_id', None)
        
        if not tenant_id:
            return Response({'error': 'User has no tenant'}, status=status.HTTP_403_FORBIDDEN)
            
        tenant_id = str(tenant_id)
        vendor_id = request.query_params.get('vendor_id')
        vendor_name = request.query_params.get('vendor_name')
        
        if not vendor_id and not vendor_name:
            return Response([], status=status.HTTP_200_OK)
            
        po_list = db.get_pending_pos_for_vendor(tenant_id, vendor_id, vendor_name)
        
        # Return in the format requested by user: [{"id": 1, "po_number": "PO000001"}]
        # No extra fields as requested.
        return Response(po_list, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
