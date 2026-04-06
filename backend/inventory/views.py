from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
import re
from django.db.models import Exists, OuterRef

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

    @action(detail=True, methods=['get'], url_path='next-number')
    def next_number(self, request, pk=None):
        """
        Returns the next auto-generated Issue Slip number for this series.
        """
        series = self.get_object()
        tenant_id = get_tenant_from_request(request)

        prefix = series.prefix or ''
        suffix = series.suffix or ''
        year = series.year or ''
        required_digits = series.required_digits or 4

        # Use the separator from preview if available, otherwise default to '-'
        preview = str(series.preview or '')
        sep: str = '-'
        for s in ['/', '_', '-', ' ']:
            if s in preview:
                sep = s
                break

        # Build the pattern prefix used in number
        number_parts: list[str] = []
        if prefix:
            number_parts.append(str(prefix))
        if year:
            number_parts.append(str(year))
        
        number_prefix: str = f"{str(sep).join(number_parts)}{sep}" if number_parts else ''

        # Count existing outward slips for this tenant that match this series pattern
        existing_count = InventoryOperationOutward.objects.filter(
            tenant_id=tenant_id,
            outward_slip_no__startswith=number_prefix
        ).count()

        next_seq = existing_count + 1
        seq_str = str(next_seq).zfill(required_digits)

        # Compose the number
        parts: list[str] = []
        if prefix:
            parts.append(str(prefix))
        if year:
            parts.append(str(year))
        parts.append(str(seq_str))
        if suffix:
            parts.append(str(suffix))

        slip_no: str = str(sep).join(parts)

        return Response({'outward_slip_no': slip_no, 'series_name': series.name})

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
        queryset = InventoryOperationProduction.objects.filter(tenant_id=tenant_id)
        
        # Support filtering by production_type (e.g., materials_issued, inter_process)
        production_type = self.request.query_params.get('production_type')
        if production_type:
            queryset = queryset.filter(production_type=production_type)
            
        return queryset.order_by('-id')

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

        # Increment the preview number in the master series
        series_name = self.request.data.get('issue_slip_series_name')
        if series_name:
            import re
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
        series_name = self.request.data.get('grn_series_name')
        if series_name:
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
        vendor_name = self.request.query_params.get('vendor_name')
        
        # 1. Get all Posted GRNs for this tenant
        qs = InventoryOperationNewGRN.objects.filter(
            tenant_id=tenant_id, 
            status='Posted',
            grn_type='purchases' # Explicitly fetch only Purchase-type GRNs
        )

        if vendor_name:
            qs = qs.filter(vendor_name=vendor_name)
        
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
