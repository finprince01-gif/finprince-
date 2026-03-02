"""
Inventory API Layer - HTTP Routing ONLY
NO business logic, NO RBAC, NO tenant validation.
Only HTTP handling - all logic delegated to flow.py
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from inventory.models import (
    InventoryStockGroup, InventoryUnit, InventoryStockItem, StockMovement
)
from inventory.serializers import (
    InventoryStockGroupSerializer, InventoryUnitSerializer,
    InventoryStockItemSerializer, StockMovementSerializer
)
from . import flow


# ============================================================================
# STOCK GROUP VIEWSET
# ============================================================================

class InventoryStockGroupViewSet(viewsets.ModelViewSet):
    """
    API endpoints for stock groups.
    All logic delegated to flow layer.
    """
    queryset = InventoryStockGroup.objects.all()
    serializer_class = InventoryStockGroupSerializer
    permission_classes = [IsAuthenticated]

    
    def get_queryset(self):
        """Delegate to flow layer."""
        return flow.list_stock_groups(self.request.user)
    
    def create(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        stock_group = flow.create_stock_group(request.user, serializer.validated_data)
        
        response_serializer = self.get_serializer(stock_group)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )
    
    def update(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        stock_group = flow.update_stock_group(
            request.user,
            instance.id,
            serializer.validated_data
        )
        
        response_serializer = self.get_serializer(stock_group)
        return Response(response_serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        instance = self.get_object()
        flow.delete_stock_group(request.user, instance.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================================================
# UNIT VIEWSET
# ============================================================================

class InventoryUnitViewSet(viewsets.ModelViewSet):
    """
    API endpoints for units.
    All logic delegated to flow layer.
    """
    queryset = InventoryUnit.objects.all()
    serializer_class = InventoryUnitSerializer
    permission_classes = [IsAuthenticated]

    
    def get_queryset(self):
        """Delegate to flow layer."""
        return flow.list_units(self.request.user)
    
    def create(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        unit = flow.create_unit(request.user, serializer.validated_data)
        
        response_serializer = self.get_serializer(unit)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )
    
    def update(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        unit = flow.update_unit(
            request.user,
            instance.id,
            serializer.validated_data
        )
        
        response_serializer = self.get_serializer(unit)
        return Response(response_serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        instance = self.get_object()
        flow.delete_unit(request.user, instance.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================================================
# STOCK ITEM VIEWSET
# ============================================================================

class InventoryStockItemViewSet(viewsets.ModelViewSet):
    """
    API endpoints for stock items.
    All logic delegated to flow layer.
    """
    queryset = InventoryStockItem.objects.all()
    serializer_class = InventoryStockItemSerializer
    permission_classes = [IsAuthenticated]

    
    def get_queryset(self):
        """Delegate to flow layer."""
        return flow.list_stock_items(self.request.user)
    
    def create(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        stock_item = flow.create_stock_item(request.user, serializer.validated_data)
        
        response_serializer = self.get_serializer(stock_item)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )
    
    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk_create(self, request):
        """Create multiple stock items at once - delegate to flow layer."""
        items_data = request.data if isinstance(request.data, list) else [request.data]
        
        serializer = self.get_serializer(data=items_data, many=True)
        serializer.is_valid(raise_exception=True)
        
        flow.bulk_create_stock_items(request.user, serializer.validated_data)
        
        return Response({'success': True, 'count': len(items_data)}, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        stock_item = flow.update_stock_item(
            request.user,
            instance.id,
            serializer.validated_data
        )
        
        response_serializer = self.get_serializer(stock_item)
        return Response(response_serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        instance = self.get_object()
        flow.delete_stock_item(request.user, instance.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================================================
# STOCK MOVEMENT VIEWSET
# ============================================================================

class StockMovementViewSet(viewsets.ModelViewSet):
    """
    API endpoints for stock movements.
    All logic delegated to flow layer.
    """
    queryset = StockMovement.objects.all()
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Delegate to flow layer."""
        return flow.list_stock_movements(self.request.user)
    
    def create(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        movement = flow.create_stock_movement(request.user, serializer.validated_data)
        
        response_serializer = self.get_serializer(movement)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )
    
    def update(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        movement = flow.update_stock_movement(
            request.user,
            instance.id,
            serializer.validated_data
        )
        
        response_serializer = self.get_serializer(movement)
        return Response(response_serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        instance = self.get_object()
        flow.delete_stock_movement(request.user, instance.id)
        return Response(status=status.HTTP_204_NO_CONTENT)
