from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
import re
from django.db.models import Exists, OuterRef, Sum
from django.db import transaction
from django.utils import timezone

from .models import (
    InventoryMasterCategory, InventoryLocation, InventoryItem, InventoryUnit,
    InventoryMasterGRN, InventoryMasterIssueSlip,
    InventoryOperationJobWork, InventoryOperationInterUnit, 
    InventoryOperationLocationChange, InventoryOperationProduction,
    InventoryOperationConsumption, InventoryOperationScrap,
    InventoryOperationOutward,
    InventoryOperationNewGRN, InventoryOperationNewGRNItem,
    InventoryStockItem, StockMovement
)
from .serializers import (
    InventoryMasterCategorySerializer, 
    InventoryLocationSerializer, 
    InventoryItemSerializer,
    InventoryUnitSerializer,
    InventoryMasterGRNSerializer,
    InventoryMasterIssueSlipSerializer,
    InventoryOperationJobWorkSerializer,
    InventoryOperationInterUnitSerializer,
    InventoryOperationLocationChangeSerializer,
    InventoryOperationProductionSerializer,
    InventoryOperationConsumptionSerializer,
    InventoryOperationScrapSerializer,
    InventoryOperationOutwardSerializer,
    InventoryOperationNewGRNSerializer
)
from core.tenant import get_tenant_from_request

class InventoryMasterCategoryViewSet(viewsets.ModelViewSet):
    """
    API endpoint for Inventory Master Category
    """
    serializer_class = InventoryMasterCategorySerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        queryset = InventoryMasterCategory.objects.filter(tenant_id=tenant_id)
        if self.action == 'list':
            return queryset.filter(is_active=True)
        return queryset
    
    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

    def destroy(self, request, *args, **kwargs):
        """Soft delete"""
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InventoryLocationViewSet(viewsets.ModelViewSet):
    """
    API endpoint for Inventory Location
    """
    serializer_class = InventoryLocationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryLocation.objects.filter(tenant_id=tenant_id)
    
    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)


class InventoryItemViewSet(viewsets.ModelViewSet):
    """
    API endpoint for Inventory Items
    """
    serializer_class = InventoryItemSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        queryset = InventoryItem.objects.filter(tenant_id=tenant_id).select_related('category')
        if self.action == 'list':
            return queryset.filter(is_active=True)
        return queryset
    
    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

    def destroy(self, request, *args, **kwargs):
        """Soft delete"""
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InventoryUnitViewSet(viewsets.ModelViewSet):
    """
    API endpoint for Inventory Units
    """
    serializer_class = InventoryUnitSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        if tenant_id:
            queryset = InventoryUnit.objects.filter(tenant_id=tenant_id)
        else:
            queryset = InventoryUnit.objects.all()
        
        if self.action == 'list':
            return queryset.filter(is_active=True)
        return queryset

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        if tenant_id:
            serializer.save(tenant_id=tenant_id)
        else:
             serializer.save()

    def destroy(self, request, *args, **kwargs):
        """Soft delete"""
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InventoryMasterGRNViewSet(viewsets.ModelViewSet):
    """
    API endpoint for Inventory Master GRN
    """
    serializer_class = InventoryMasterGRNSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        queryset = InventoryMasterGRN.objects.filter(tenant_id=tenant_id)
        if self.action == 'list':
            return queryset.filter(is_active=True)
        return queryset

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

    def destroy(self, request, *args, **kwargs):
        """Soft delete"""
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='next-number')
    def next_number(self, request, pk=None):
        """
        Returns the next auto-generated GRN number for this series from the master preview.
        """
        series = self.get_object()
        return Response({'grn_no': series.preview, 'series_name': series.name})

def increment_issue_slip_series(tenant_id, series_name, series_id=None):
    """
    Utility to increment the preview number for an Issue Slip Series.
    """
    if not series_name and not series_id:
        return
    try:
        series = None
        if series_id:
            series = InventoryMasterIssueSlip.objects.filter(tenant_id=tenant_id, id=series_id).first()
        elif series_name:
            series = InventoryMasterIssueSlip.objects.filter(tenant_id=tenant_id, name=series_name).first()
            
        if series and series.preview:
            match = re.search(r'(\d+)$', series.preview)
            if match:
                num_str = match.group(1)
                num = int(num_str) + 1
                prefix = series.preview[:match.start()]
                series.preview = f"{prefix}{num:0{len(num_str)}d}"
            else:
                series.preview = f"{series.preview}-1"
            series.save()
    except Exception as e:
        import logging
        logger = logging.getLogger('inventory.increment')
        logger.error(f"Error incrementing series {series_name}: {str(e)}")

def record_stock_movement(tenant_id, item_code, item_name, voucher_type, voucher_no, quantity, rate, location_name, is_inward=True):
    """
    Records a stock movement and updates the inventory stock item balance.
    """
    try:
        with transaction.atomic():
            # 1. Get or create the inventory stock item
            stock_item, created = InventoryStockItem.objects.get_or_create(
                tenant_id=tenant_id,
                item_code=item_code,
                defaults={
                    'name': item_name,
                    'current_balance': 0,
                    'rate': rate
                }
            )
            
            # Update name if it's different (optional)
            if not created and item_name:
                stock_item.name = item_name
            
            # 2. Update balance
            old_balance = stock_item.current_balance
            qty_decimal = Decimal(str(quantity))
            
            if is_inward:
                new_balance = old_balance + qty_decimal
                inward_qty = qty_decimal
                outward_qty = 0
            else:
                new_balance = old_balance - qty_decimal
                inward_qty = 0
                outward_qty = qty_decimal
                
            stock_item.current_balance = new_balance
            stock_item.rate = rate # Update rate to latest
            stock_item.save()
            
            # 3. Create stock movement entry
            StockMovement.objects.create(
                tenant_id=tenant_id,
                item_code=item_code,
                date=timezone.now().date(),
                time=timezone.now().time(),
                voucher_type=voucher_type,
                voucher_no=voucher_no,
                location=location_name,
                inward_qty=inward_qty,
                outward_qty=outward_qty,
                balance_qty=new_balance,
                rate=rate,
                value=qty_decimal * rate
            )
    except Exception as e:
        import logging
        logger = logging.getLogger('inventory.movement')
        logger.error(f"Error recording stock movement: {str(e)}")

from decimal import Decimal


class InventoryMasterIssueSlipViewSet(viewsets.ModelViewSet):
    """
    API endpoint for Inventory Master Issue Slip
    """
    serializer_class = InventoryMasterIssueSlipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        queryset = InventoryMasterIssueSlip.objects.filter(tenant_id=tenant_id)
        if self.action == 'list':
            return queryset.filter(is_active=True)
        return queryset

    @action(detail=True, methods=['get'], url_path='next-number')
    def next_number(self, request, pk=None):
        """
        Returns the next auto-generated Issue Slip number for this series.
        """
        series = self.get_object()
        return Response({'outward_slip_no': series.preview, 'series_name': series.name})

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

    def destroy(self, request, *args, **kwargs):
        """Soft delete"""
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)



# -------------------------------------------------------------------------
# OPERATION VIEWS
# -------------------------------------------------------------------------

class InventoryOperationJobWorkViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationJobWorkSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        queryset = InventoryOperationJobWork.objects.filter(tenant_id=tenant_id)
        
        operation_type = self.request.query_params.get('operation_type')
        if operation_type:
            queryset = queryset.filter(operation_type=operation_type)
            
        vendor_name = self.request.query_params.get('vendor_name')
        if vendor_name:
            queryset = queryset.filter(vendor_name=vendor_name)
            
        return queryset.order_by('-id')

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        try:
            instance = serializer.save(tenant_id=tenant_id)
            
            # Increment the preview number in the master series
            series_name = self.request.data.get('issue_slip_series')
            series_id = self.request.data.get('issue_slip_series_id')
            increment_issue_slip_series(tenant_id, series_name, series_id)
            
            # Record Movement
            operation_type = self.request.data.get('operation_type', 'outward')
            items_data = self.request.data.get('items', [])
            if isinstance(items_data, str):
                import json
                items_data = json.loads(items_data)
            
            is_inward = (operation_type == 'receipt')
            voucher_no = instance.job_work_receipt_no if is_inward else instance.job_work_outward_no
            
            for item in items_data:
                record_stock_movement(
                    tenant_id=tenant_id,
                    item_code=item.get('item_code', item.get('itemCode')),
                    item_name=item.get('item_name', item.get('itemName')),
                    voucher_type=f"Job Work {operation_type.title()}",
                    voucher_no=voucher_no,
                    quantity=item.get('quantity', item.get('qty', 0)),
                    rate=Decimal(str(item.get('rate', 0))),
                    location_name=self.request.data.get('location_name'),
                    is_inward=is_inward
                )
        except Exception as e:
            import logging
            logger = logging.getLogger('inventory.operations')
            logger.error(f"Error saving JobWork: {str(e)}")
            raise

class InventoryOperationInterUnitViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationInterUnitSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationInterUnit.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        instance = serializer.save(tenant_id=tenant_id)
        
        # Increment the preview number in the master series
        series_name = self.request.data.get('issue_slip_series')
        series_id = self.request.data.get('issue_slip_series_id')
        increment_issue_slip_series(tenant_id, series_name, series_id)

        # Record Movement
        items_data = self.request.data.get('items', [])
        if isinstance(items_data, str):
            import json
            items_data = json.loads(items_data)
        
        for item in items_data:
            qty = item.get('quantity', item.get('quantity_issued', item.get('qty', 0)))
            common_data = {
                'tenant_id': tenant_id,
                'item_code': item.get('item_code', item.get('itemCode')),
                'item_name': item.get('item_name', item.get('itemName')),
                'voucher_no': instance.issue_slip_no,
                'quantity': qty,
                'rate': Decimal(str(item.get('rate', 0))),
            }
            # Outward from source
            record_stock_movement(**common_data, voucher_type="Inter-Unit Transfer (Out)", location_name=instance.goods_from_location, is_inward=False)
            # Inward to destination
            record_stock_movement(**common_data, voucher_type="Inter-Unit Transfer (In)", location_name=instance.goods_to_location, is_inward=True)

class InventoryOperationLocationChangeViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationLocationChangeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationLocationChange.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        instance = serializer.save(tenant_id=tenant_id)
        
        # Increment the preview number in the master series
        series_name = self.request.data.get('issue_slip_series')
        series_id = self.request.data.get('issue_slip_series_id')
        increment_issue_slip_series(tenant_id, series_name, series_id)

        # Record Movement
        items_data = self.request.data.get('items', [])
        if isinstance(items_data, str):
            import json
            items_data = json.loads(items_data)
        
        for item in items_data:
            qty = item.get('quantity', item.get('qty', 0))
            common_data = {
                'tenant_id': tenant_id,
                'item_code': item.get('item_code', item.get('itemCode')),
                'item_name': item.get('item_name', item.get('itemName')),
                'voucher_no': instance.issue_slip_no,
                'quantity': qty,
                'rate': Decimal(str(item.get('rate', 0))),
            }
            # Outward from source
            record_stock_movement(**common_data, voucher_type="Location Change (Out)", location_name=instance.goods_from_location, is_inward=False)
            # Inward to destination
            record_stock_movement(**common_data, voucher_type="Location Change (In)", location_name=instance.goods_to_location, is_inward=True)

class InventoryOperationProductionViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationProductionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        queryset = InventoryOperationProduction.objects.filter(tenant_id=tenant_id)
        
        # Support filtering by production_type (e.g., materials_issued, inter_process)
        production_type = self.request.query_params.get('production_type')
        if production_type:
            queryset = queryset.filter(production_type=production_type)
            
        return queryset.order_by('-id')

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        try:
            instance = serializer.save(tenant_id=tenant_id)
            
            # Increment
            series_name = self.request.data.get('issue_slip_series')
            series_id = self.request.data.get('issue_slip_series_id')
            increment_issue_slip_series(tenant_id, series_name, series_id)

            # Record Movement
            items_data = self.request.data.get('items', [])
            if isinstance(items_data, str):
                import json
                items_data = json.loads(items_data)
            
            p_type = instance.production_type
            for item in items_data:
                item_type = item.get('item_type', '')
                is_inward = (item_type == 'output')
                qty = item.get('quantity', item.get('qty', 0))
                
                record_stock_movement(
                    tenant_id=tenant_id,
                    item_code=item.get('item_code', item.get('itemCode')),
                    item_name=item.get('item_name', item.get('itemName')),
                    voucher_type=f"Production ({p_type})",
                    voucher_no=instance.issue_slip_no,
                    quantity=qty,
                    rate=Decimal(str(item.get('rate', 0))),
                    location_name=instance.goods_from_location if not is_inward else instance.goods_to_location,
                    is_inward=is_inward
                )
        except Exception as e:
            import logging
            logger = logging.getLogger('inventory.operations')
            logger.error(f"Error saving Production: {str(e)}")
            raise

class InventoryOperationConsumptionViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationConsumptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationConsumption.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        try:
            instance = serializer.save(tenant_id=tenant_id)
            
            # Increment
            series_name = self.request.data.get('issue_slip_series')
            series_id = self.request.data.get('issue_slip_series_id')
            increment_issue_slip_series(tenant_id, series_name, series_id)

            # Record Movement
            items_data = self.request.data.get('items', [])
            if isinstance(items_data, str):
                import json
                items_data = json.loads(items_data)
            
            for item in items_data:
                record_stock_movement(
                    tenant_id=tenant_id,
                    item_code=item.get('item_code', item.get('itemCode')),
                    item_name=item.get('item_name', item.get('itemName')),
                    voucher_type="Consumption",
                    voucher_no=instance.issue_slip_no,
                    quantity=item.get('quantity', item.get('qty', 0)),
                    rate=Decimal(str(item.get('rate', 0))),
                    location_name=instance.goods_from_location,
                    is_inward=False
                )
        except Exception as e:
            import logging
            logger = logging.getLogger('inventory.operations')
            logger.error(f"Error saving Consumption: {str(e)}")
            raise

class InventoryOperationScrapViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationScrapSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationScrap.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        try:
            instance = serializer.save(tenant_id=tenant_id)
            
            # Increment
            series_name = self.request.data.get('issue_slip_series')
            series_id = self.request.data.get('issue_slip_series_id')
            increment_issue_slip_series(tenant_id, series_name, series_id)

            # Record Movement
            items_data = self.request.data.get('items', [])
            if isinstance(items_data, str):
                import json
                items_data = json.loads(items_data)
            
            for item in items_data:
                record_stock_movement(
                    tenant_id=tenant_id,
                    item_code=item.get('item_code', item.get('itemCode')),
                    item_name=item.get('item_name', item.get('itemName')),
                    voucher_type="Scrap",
                    voucher_no=instance.issue_slip_no,
                    quantity=item.get('quantity', item.get('qty', 0)),
                    rate=Decimal(str(item.get('rate', 0))),
                    location_name=instance.goods_from_location,
                    is_inward=False
                )
        except Exception as e:
            import logging
            logger = logging.getLogger('inventory.operations')
            logger.error(f"Error saving Scrap: {str(e)}")
            raise

# InventoryOperationGRNViewSet removed - replaced by InventoryOperationNewGRNViewSet

class InventoryOperationOutwardViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationOutwardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationOutward.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        try:
            instance = serializer.save(tenant_id=tenant_id)
            
            # Increment
            series_id = self.request.data.get('issue_slip_series_id')
            series_name = self.request.data.get('issue_slip_series')
            increment_issue_slip_series(tenant_id, series_name, series_id)

            # Record Movement
            items_data = self.request.data.get('items', [])
            if isinstance(items_data, str):
                import json
                items_data = json.loads(items_data)
            
            # Get location name
            loc_name = ""
            if instance.location:
                loc_name = instance.location.name
            
            for item in items_data:
                record_stock_movement(
                    tenant_id=tenant_id,
                    item_code=item.get('item_code', item.get('itemCode')),
                    item_name=item.get('item_name', item.get('itemName')),
                    voucher_type=f"Outward ({instance.outward_type})",
                    voucher_no=instance.outward_slip_no,
                    quantity=item.get('quantity', item.get('qty', 0)),
                    rate=Decimal(str(item.get('rate', 0))),
                    location_name=loc_name,
                    is_inward=False
                )
        except Exception as e:
            import logging
            logger = logging.getLogger('inventory.operations')
            logger.error(f"Error saving Outward: {str(e)}")
            raise

    @action(detail=False, methods=['get'], url_path='pending')
    def pending(self, request):
        tenant_id = get_tenant_from_request(request)
        vendor_name = request.query_params.get('vendor_name')
        
        # 1. Get all Posted Outward Slips (Purchase Returns)
        qs = InventoryOperationOutward.objects.filter(
            tenant_id=tenant_id,
            status='Posted',
            outward_type='purchase_return'
        )
        
        if vendor_name:
            qs = qs.filter(vendor_name=vendor_name)
            
        # 2. Exclude those already linked to a Debit Note
        from accounting.models_voucher_debit_note import VoucherDebitNoteSupplierDetails
        linked_slips = VoucherDebitNoteSupplierDetails.objects.filter(
            tenant_id=tenant_id
        ).values_list('outward_slip_nos', flat=True)
        
        all_linked = []
        for s in linked_slips:
            if s:
                all_linked.extend([ss.strip() for ss in s.split(',') if ss.strip()])
        
        qs = qs.exclude(outward_slip_no__in=all_linked)
        
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

class InventoryOperationNewGRNViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationNewGRNSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationNewGRN.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        instance = serializer.save(tenant_id=tenant_id)
        
        # Increment the preview number in the GRN master series
        series_id = self.request.data.get('grn_series_id')
        series_name = self.request.data.get('grn_series_name')
        series = None
        if series_id:
            series = InventoryMasterGRN.objects.filter(tenant_id=tenant_id, id=series_id).first()
        elif series_name:
            series = InventoryMasterGRN.objects.filter(tenant_id=tenant_id, name=series_name).first()

        if series and series.preview:
            import re
            match = re.search(r'(\d+)$', series.preview)
            if match:
                num_str = match.group(1)
                num = int(num_str) + 1
                prefix = series.preview[:match.start()]
                series.preview = f"{prefix}{num:0{len(num_str)}d}"
            else:
                series.preview = f"{series.preview}-1"
            series.save()
        
        # Record Stock Movement for GRN
        items_data = self.request.data.get('items', [])
        if isinstance(items_data, str):
            import json
            items_data = json.loads(items_data)
            
        location_id = self.request.data.get('location_id')
        location_name = ""
        if location_id:
            loc = InventoryLocation.objects.filter(id=location_id).first()
            if loc: location_name = loc.name

        for item in items_data:
            # Match snake_case keys used in Inventory.tsx handleGRNSubmit
            qty = item.get('accepted_qty', item.get('received_qty', item.get('quantity', 0)))
            record_stock_movement(
                tenant_id=tenant_id,
                item_code=item.get('item_code', item.get('itemCode')),
                item_name=item.get('item_name', item.get('itemName')),
                voucher_type="GRN",
                voucher_no=instance.grn_no,
                quantity=qty,
                rate=Decimal(str(item.get('rate', 0))),
                location_name=location_name,
                is_inward=True
            )

    @action(detail=False, methods=['get'], url_path='next-grn-number')
    def next_grn_number(self, request):
        """
        Generate the next GRN number for the tenant.
        """
        tenant_id = get_tenant_from_request(self.request)
        
        # 1. Fetch the last GRN for this tenant
        last_grn = InventoryOperationNewGRN.objects.filter(
            tenant_id=tenant_id
        ).order_by('-id').first()

        if last_grn and last_grn.grn_no:
            # 2. Extract numeric suffix if it exists
            match = re.search(r'(\d+)$', last_grn.grn_no)
            if match:
                num_str = match.group(1)
                num = int(num_str) + 1
                prefix = last_grn.grn_no[:match.start()]
                # Preserve padding (e.g., GRN-0001 -> GRN-0002)
                next_no = f"{prefix}{num:0{len(num_str)}d}"
            else:
                next_no = f"{last_grn.grn_no}-1"
        else:
            # 3. Default for first entry
            next_no = "GRN-0001"

        return Response({'next_grn_no': next_no})

from rest_framework import generics
from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails

class PendingGRNListView(generics.ListAPIView):
    """
    API endpoint to list Posted GRNs that are NOT yet linked to any Purchase Voucher.
    """
    serializer_class = InventoryOperationNewGRNSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        grn_type = self.request.query_params.get('grn_type', 'purchases')
        vendor_name = self.request.query_params.get('vendor_name')
        customer_name = self.request.query_params.get('customer_name')
        
        # 1. Base queryset for this tenant and status
        qs = InventoryOperationNewGRN.objects.filter(
            tenant_id=tenant_id, 
            status='Posted',
            grn_type=grn_type
        )

        if vendor_name:
            qs = qs.filter(vendor_name__iexact=vendor_name.strip())
        
        if customer_name:
            qs = qs.filter(customer_name__iexact=customer_name.strip())
        
        # 2. Get list of GRN numbers already used in Purchase Vouchers
        used_grns = VoucherPurchaseSupplierDetails.objects.filter(
            tenant_id=OuterRef('tenant_id'),
            grn_reference=OuterRef('grn_no')
        )
        
        # 3. Exclude used GRNs & Empty GRN numbers
        return qs.annotate(
            is_used=Exists(used_grns)
        ).filter(
            is_used=False
        ).exclude(grn_no__isnull=True).exclude(grn_no__exact='')


from rest_framework.views import APIView

class HsnDetailsAPIView(APIView):
    """
    GET /api/hsn-details/?hsn_code=XXXX
    Looks up igst from hsn_gst_master by hsn_code.
    Returns {"igst": value} on match, 404 {"error": "Invalid HSN"} otherwise.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        hsn_code = request.query_params.get('hsn_code', '')
        if not hsn_code:
            return Response({'error': 'Invalid HSN'}, status=status.HTTP_404_NOT_FOUND)

        hsn_code = str(hsn_code).strip()

        try:
            from .models import HsnGstMaster
            hsn_record = HsnGstMaster.objects.filter(hsn_code=hsn_code).first()
            if hsn_record and hsn_record.igst is not None:
                return Response({'igst': str(hsn_record.igst)}, status=status.HTTP_200_OK)
            else:
                return Response({'error': 'Invalid HSN'}, status=status.HTTP_404_NOT_FOUND)
        except Exception:
            return Response({'error': 'Invalid HSN'}, status=status.HTTP_404_NOT_FOUND)


class StockMovementSummaryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    
    def list(self, request):
        tenant_id = get_tenant_from_request(request)
        
        # We need to aggregate movements per item
        # To get Opening, Inward, Outward, Closing
        # For simplicity, we'll fetch all StockItems and join with their aggregated movements
        
        stock_items = InventoryStockItem.objects.filter(tenant_id=tenant_id)
        
        # Get category information from InventoryItem master
        master_items = InventoryItem.objects.filter(tenant_id=tenant_id).select_related('category')
        
        # Build lookups by Code and by Name
        master_by_code = {}
        master_by_name = {}
        
        for i in master_items:
            # Combine Category + Subcategory into a single display category
            cat_main = i.category.category if i.category else 'General'
            sub = (i.category.subgroup if i.category else '') or (i.category_path if i.category_path else '')
            
            display_cat = f"{cat_main} > {sub}" if sub and cat_main != 'General' else (sub if sub else cat_main)
            
            # If sub contains cat_main already (sometimes path does), just use sub
            if sub and cat_main in sub:
                display_cat = sub

            info = {
                'category': display_cat,
                'subCategory': '' # Blanking this out as we are merging
            }
            if i.item_code:
                master_by_code[i.item_code] = info
            if i.item_name:
                master_by_name[i.item_name] = info

        data = []
        for item in stock_items:
            movements = StockMovement.objects.filter(tenant_id=tenant_id, item_code=item.item_code)
            
            inward = movements.aggregate(qty=Sum('inward_qty'), val=Sum('value'))
            outward = movements.aggregate(qty=Sum('outward_qty'), val=Sum('value'))
            
            inward_qty = float(inward['qty'] or 0)
            inward_val = float(inward['val'] or 0) if inward_qty > 0 else 0
            
            outward_qty = float(outward['qty'] or 0)
            outward_val = float(outward['val'] or 0) if outward_qty > 0 else 0
            
            # Lookup logic: Try Code first, then Name
            master_info = master_by_code.get(item.item_code)
            if not master_info:
                master_info = master_by_name.get(item.name)
            
            if not master_info:
                master_info = {'category': 'General', 'subCategory': ''}

            data.append({
                'id': item.id,
                'category': master_info['category'],
                'subCategory': master_info['subCategory'],
                'itemCode': item.item_code,
                'itemName': item.name,
                'uom': item.unit,
                'openingQty': 0, 
                'openingValue': 0, 
                'inwardQty': inward_qty,
                'inwardValue': inward_val,
                'outwardQty': outward_qty,
                'outwardValue': outward_val,
                'closingQty': float(item.current_balance),
                'closingValue': float(item.current_balance * item.rate)
            })
            
        return Response(data)

    @action(detail=False, methods=['post'], url_path='recalculate')
    def recalculate(self, request):
        """
        Emergency action to reconstruct stock items and movements from operational data.
        """
        tenant_id = get_tenant_from_request(request)
        
        with transaction.atomic():
            # Clear existing (optional, but safer for full reconstruct)
            # StockMovement.objects.filter(tenant_id=tenant_id).delete()
            # InventoryStockItem.objects.filter(tenant_id=tenant_id).update(current_balance=0)
            
            processed_ref_nos = set() # To track processed operations (GRNs, Outward Slips)
            
            # 1. Process GRNs
            grns = InventoryOperationNewGRN.objects.filter(tenant_id=tenant_id)
            processed_count = 0
            for grn in grns:
                # We need to find the items. They might be in the child table
                items = InventoryOperationNewGRNItem.objects.filter(parent=grn)
                # If child table is empty, try to get from grn.items if it was a JSONField (it's not)
                
                location_name = ""
                if grn.location_id:
                    loc = InventoryLocation.objects.filter(id=grn.location_id).first()
                    if loc: location_name = loc.name
                
                v_no = grn.grn_no or "N/A"
                processed_ref_nos.add(v_no)
                for item in items:
                    qty = item.accepted_qty or item.received_qty or item.quantity or 0
                    if qty > 0:
                        record_stock_movement(
                            tenant_id=tenant_id,
                            item_code=item.item_code,
                            item_name=item.item_name,
                            voucher_type="GRN (Reconstructed)",
                            voucher_no=v_no,
                            quantity=qty,
                            rate=item.rate or 0,
                            location_name=location_name,
                            is_inward=True
                        )
                        processed_count += 1
            
            # 2. Process Job Works
            jws = InventoryOperationJobWork.objects.filter(tenant_id=tenant_id)
            for jw in jws:
                from .models import InventoryOperationJobWorkItem
                items = InventoryOperationJobWorkItem.objects.filter(parent=jw)
                op_type = jw.operation_type or 'outward'
                is_inward = (op_type == 'receipt')
                v_no = jw.job_work_receipt_no if is_inward else jw.job_work_outward_no
                
                for item in items:
                    record_stock_movement(
                        tenant_id=tenant_id,
                        item_code=item.item_code,
                        item_name=item.item_name,
                        voucher_type=f"Job Work {op_type.title()} (Reconstructed)",
                        voucher_no=v_no or "N/A",
                        quantity=item.quantity or 0,
                        rate=item.rate or 0,
                        location_name="",
                        is_inward=is_inward
                    )
                    processed_count += 1

            # 3. Process Outward Slips
            outwards = InventoryOperationOutward.objects.filter(tenant_id=tenant_id)
            for out in outwards:
                from .models import InventoryOperationOutwardItem
                items = InventoryOperationOutwardItem.objects.filter(parent=out)
                loc_name = out.location.name if out.location else ""
                v_no = out.outward_slip_no or "N/A"
                processed_ref_nos.add(v_no)
                for item in items:
                    record_stock_movement(
                        tenant_id=tenant_id,
                        item_code=item.item_code,
                        item_name=item.item_name,
                        voucher_type=f"Outward {out.outward_type} (Reconstructed)",
                        voucher_no=v_no,
                        quantity=item.quantity or 0,
                        rate=item.rate or 0,
                        location_name=loc_name,
                        is_inward=False
                    )
                    processed_count += 1

            # 4. Process Purchase Vouchers
            from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails, VoucherPurchaseItem
            p_vouchers = VoucherPurchaseSupplierDetails.objects.filter(tenant_id=tenant_id)
            for pv in p_vouchers:
                items = VoucherPurchaseItem.objects.filter(supplier_details=pv)
                v_no = pv.purchase_voucher_no or pv.supplier_invoice_no or "N/A"
                ref = f" (Ref: {pv.grn_reference})" if pv.grn_reference else ""
                
                for item in items:
                    record_stock_movement(
                        tenant_id=tenant_id,
                        item_code=item.item_code,
                        item_name=item.item_name,
                        voucher_type=f"Purchase Voucher{ref}",
                        voucher_no=v_no,
                        quantity=item.quantity or 0,
                        rate=item.rate or 0,
                        location_name="", 
                        is_inward=True
                    )
                    processed_count += 1

            # 5. Process Sales Vouchers
            from accounting.models_voucher_sales import VoucherSalesInvoiceDetails, VoucherSalesItems
            s_vouchers = VoucherSalesInvoiceDetails.objects.filter(tenant_id=tenant_id)
            for sv in s_vouchers:
                items = VoucherSalesItems.objects.filter(invoice=sv)
                ref = f" (Ref: {sv.outward_slip_no})" if sv.outward_slip_no else ""
                
                for item in items:
                    record_stock_movement(
                        tenant_id=tenant_id,
                        item_code=item.item_code,
                        item_name=item.item_name,
                        voucher_type=f"Sales Voucher{ref}",
                        voucher_no=sv.sales_invoice_no or "N/A",
                        quantity=item.qty or 0,
                        rate=item.item_rate or 0,
                        location_name="",
                        is_inward=False
                    )
                    processed_count += 1
                    
        return Response({'success': True, 'processed_items': processed_count})

    @action(detail=False, methods=['get'], url_path='details')
    def details(self, request):
        tenant_id = get_tenant_from_request(request)
        item_code = request.query_params.get('itemCode')
        
        movements = StockMovement.objects.filter(tenant_id=tenant_id)
        uom = ""
        if item_code:
            movements = movements.filter(item_code=item_code)
            # Try to get UOM from StockItem or Master Item
            from .models import InventoryStockItem
            stock_item = InventoryStockItem.objects.filter(tenant_id=tenant_id, item_code=item_code).first()
            if stock_item:
                uom = stock_item.unit
            
        movements = movements.order_by('date', 'time')
        
        data = []
        running_balance = 0
        for m in movements:
            # Calculate opening for this specific transaction
            opening = running_balance
            if m.inward_qty > 0:
                running_balance += float(m.inward_qty)
            else:
                running_balance -= float(m.outward_qty)
            
            data.append({
                'id': m.id,
                'date': m.date.isoformat(),
                'particulars': m.voucher_type,
                'refNo': m.voucher_no,
                'location': m.location,
                'uom': uom,
                'openingQty': opening,
                'openingValue': 0, # Placeholder
                'inwardQty': float(m.inward_qty),
                'inwardValue': float(m.value) if m.inward_qty > 0 else 0,
                'outwardQty': float(m.outward_qty),
                'outwardValue': float(m.value) if m.outward_qty > 0 else 0,
                'closingQty': running_balance,
                'closingValue': 0 # Placeholder
            })
            
        return Response(data)
