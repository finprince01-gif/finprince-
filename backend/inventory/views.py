from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
import re

from .models import (
    InventoryMasterCategory, InventoryLocation, InventoryItem, InventoryUnit,
    InventoryMasterGRN, InventoryMasterIssueSlip,
    InventoryOperationJobWork, InventoryOperationInterUnit, 
    InventoryOperationLocationChange, InventoryOperationProduction,
    InventoryOperationConsumption, InventoryOperationScrap,
    InventoryOperationOutward,
    InventoryOperationNewGRN
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
        return InventoryMasterCategory.objects.filter(tenant_id=tenant_id, is_active=True)
    
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
        queryset = InventoryItem.objects.filter(tenant_id=tenant_id)
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
        # Units might be global or tenant specific. Assuming tenant specific for now or global if no tenant_id
        # Actually InventoryUnit model doesn't have tenant_id in the simple version I saw, but BaseModel has.
        # Let's assume BaseModel usage.
        tenant_id = get_tenant_from_request(self.request)
        if tenant_id:
            return InventoryUnit.objects.filter(tenant_id=tenant_id, is_active=True)
        return InventoryUnit.objects.filter(is_active=True)

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
        return InventoryOperationJobWork.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

class InventoryOperationInterUnitViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationInterUnitSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationInterUnit.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

class InventoryOperationLocationChangeViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationLocationChangeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationLocationChange.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

class InventoryOperationProductionViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationProductionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationProduction.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

class InventoryOperationConsumptionViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationConsumptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationConsumption.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

class InventoryOperationScrapViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationScrapSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationScrap.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

# InventoryOperationGRNViewSet removed - replaced by InventoryOperationNewGRNViewSet

class InventoryOperationOutwardViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationOutwardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationOutward.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

class InventoryOperationNewGRNViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryOperationNewGRNSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return InventoryOperationNewGRN.objects.filter(tenant_id=tenant_id)

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

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
        
        # 1. Get all Posted GRNs for this tenant
        qs = InventoryOperationNewGRN.objects.filter(
            tenant_id=tenant_id, 
            status='Posted',
            grn_type='purchases' # Explicitly fetch only Purchase-type GRNs
        )
        
        # 2. Get list of GRN numbers already used in Purchase Vouchers
        used_grns = VoucherPurchaseSupplierDetails.objects.filter(
            tenant_id=tenant_id
        ).values_list('grn_reference', flat=True)
        
        # 3. Exclude used GRNs & Empty GRN numbers
        # Filter out empty strings/nulls from exclusion check to be safe, though usage should be strict
        used_grns = [g for g in used_grns if g]
        
        return qs.exclude(grn_no__in=used_grns).exclude(grn_no__isnull=True).exclude(grn_no__exact='')
