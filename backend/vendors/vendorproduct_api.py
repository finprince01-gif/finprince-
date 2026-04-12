"""
API ViewSet for Vendor Master Products and Services.
New design: one-record-per-vendor with a JSON items array.
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
import logging

from .vendorproduct_serializers import (
    VendorProductServiceSerializer,
    VendorProductServiceCreateSerializer,
    VendorProductServiceUpdateSerializer,
)
from .vendorproduct_database import VendorProductServiceDatabase

logger = logging.getLogger(__name__)


class VendorProductServiceViewSet(viewsets.ViewSet):
    """
    ViewSet for Vendor Products & Services (JSON-array design).

    Endpoints:
      POST   /api/vendors/product-services/
             Body: { vendor_basic_detail: <id>, items: [{...}, ...] }
             → Upserts the JSON items array for that vendor.

      GET    /api/vendors/product-services/
             ?vendor_basic_detail=<id>  → single vendor record
             (no param)                 → all records for tenant

      PATCH  /api/vendors/product-services/<vendor_id>/
             Body: { items: [{...}, ...] }
             → Replaces the items array for that vendor.

      DELETE /api/vendors/product-services/<vendor_id>/
             → Soft-deletes the record.
    """

    permission_classes = [IsAuthenticated]

    # ── helpers ────────────────────────────────────────────────────────────────

    def _tenant_id(self):
        user = self.request.user
        if user.is_anonymous:
            return 'default_tenant'
        if hasattr(user, 'tenant_id') and user.branch_id:
            return user.branch_id
        if hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id'):
            return user.tenant.tenant_id
        return str(getattr(user, 'id', 'default_tenant'))

    # ── CREATE / UPSERT ────────────────────────────────────────────────────────

    def create(self, request, *args, **kwargs):
        """
        POST /api/vendors/product-services/
        Body: { vendor_basic_detail: <id>, items: [{item_name, ...}, ...] }
        """
        serializer = VendorProductServiceCreateSerializer(data=request.data)
        if not serializer.is_valid():
            logger.error(f"Product service serializer errors: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        vd = serializer.validated_data
        tenant_id = self._tenant_id()
        vendor_id = vd['vendor_basic_detail']
        items = vd['items']

        logger.info(
            f"POST product-services: tenant={tenant_id}, vendor={vendor_id}, "
            f"item_count={len(items)}"
        )

        try:
            record = VendorProductServiceDatabase.upsert_product_services(
                tenant_id=tenant_id,
                vendor_basic_detail_id=vendor_id,
                items=items,
                created_by=request.user.username,
            )
            return Response(record, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Error saving product services: {e}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ── LIST / RETRIEVE ────────────────────────────────────────────────────────

    def list(self, request, *args, **kwargs):
        """
        GET /api/vendors/product-services/?vendor_basic_detail=<id>
        """
        tenant_id = self._tenant_id()
        vendor_id = request.query_params.get('vendor_basic_detail') or request.query_params.get('vendor_id')

        try:
            if vendor_id:
                record = VendorProductServiceDatabase.get_by_vendor(int(vendor_id))
                if not record:
                    return Response({'vendor_basic_detail': vendor_id, 'items': []})
                return Response(record)
            else:
                records = VendorProductServiceDatabase.get_by_tenant(tenant_id)
                return Response(records)
        except Exception as e:
            logger.error(f"Error fetching product services: {e}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def retrieve(self, request, pk=None, *args, **kwargs):
        """GET /api/vendors/product-services/<vendor_id>/"""
        try:
            record = VendorProductServiceDatabase.get_by_vendor(int(pk))
            if not record:
                return Response({'vendor_basic_detail': pk, 'items': []})
            return Response(record)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ── UPDATE ─────────────────────────────────────────────────────────────────

    def partial_update(self, request, pk=None, *args, **kwargs):
        """PATCH /api/vendors/product-services/<vendor_id>/"""
        serializer = VendorProductServiceUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        tenant_id = self._tenant_id()
        vendor_id = int(pk)
        items = serializer.validated_data['items']

        try:
            record = VendorProductServiceDatabase.upsert_product_services(
                tenant_id=tenant_id,
                vendor_basic_detail_id=vendor_id,
                items=items,
                created_by=request.user.username,
            )
            return Response(record)
        except Exception as e:
            logger.error(f"Error updating product services: {e}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ── DELETE ─────────────────────────────────────────────────────────────────

    def destroy(self, request, pk=None, *args, **kwargs):
        """DELETE /api/vendors/product-services/<vendor_id>/"""
        try:
            VendorProductServiceDatabase.delete_by_vendor(int(pk))
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
