"""
Serializers for Vendor Master Products and Services.
Design: one row per vendor, items stored as a JSON array.
An empty items array [] is valid and will be saved.
"""

from rest_framework import serializers
from .models import VendorMasterProductService


class ProductServiceItemSerializer(serializers.Serializer):
    """Serializer for a single item inside the JSON array."""
    hsn_sac_code     = serializers.CharField(required=False, allow_blank=True, default='')
    item_code        = serializers.CharField(required=False, allow_blank=True, default='')
    item_name        = serializers.CharField(required=True)
    supplier_item_code  = serializers.CharField(required=False, allow_blank=True, default='')
    supplier_item_name  = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_item_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("item_name cannot be empty")
        return value.strip()


class VendorProductServiceSerializer(serializers.ModelSerializer):
    """
    Full serializer – for reading (GET).
    Returns the whole record including the items JSON array.
    """
    items = serializers.JSONField(default=list)

    class Meta:
        model = VendorMasterProductService
        fields = [
            'id',
            'tenant_id',
            'vendor_basic_detail',
            'items',
            'is_active',
            'created_at',
            'updated_at',
            'created_by',
            'updated_by',
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class VendorProductServiceCreateSerializer(serializers.Serializer):
    """
    Serializer for POST (create or upsert).
    Accepts: { vendor_basic_detail: <id>, items: [{ item_name, ... }, ...] }
    items can be an empty list [] — record will still be saved/upserted.
    """
    vendor_basic_detail = serializers.IntegerField(required=True)
    items = serializers.ListField(
        child=ProductServiceItemSerializer(),
        allow_empty=True,
        required=False,   # not required – defaults to []
        default=list,
    )
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_items(self, value):
        """Keep only items that have a non-blank item_name; empty list is fine."""
        if value is None:
            return []
        return [i for i in value if i.get('item_name', '').strip()]


class VendorProductServiceUpdateSerializer(serializers.Serializer):
    """
    Serializer for PATCH (replace items list).
    items can be empty [] to clear all products.
    """
    items = serializers.ListField(
        child=ProductServiceItemSerializer(),
        allow_empty=True,
        required=False,
        default=list,
    )
    is_active = serializers.BooleanField(required=False)

    def validate_items(self, value):
        if value is None:
            return []
        return [i for i in value if i.get('item_name', '').strip()]
