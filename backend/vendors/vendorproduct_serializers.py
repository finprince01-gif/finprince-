"""
Serializers for Vendor Master Products and Services.
"""

from rest_framework import serializers
from .models import VendorMasterProductService


class VendorProductServiceSerializer(serializers.ModelSerializer):
    """
    Main serializer for VendorMasterProductService model.
    """
    
    class Meta:
        model = VendorMasterProductService
        fields = [
            'id',
            'tenant_id',
            'vendor_basic_detail',
            'hsn_sac_code',
            'item_code',
            'item_name',
            'supplier_item_code',
            'supplier_item_name',
            'is_active',
            'created_at',
            'updated_at',
            'created_by',
            'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class VendorProductServiceCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating vendor product/service.
    """
    
    class Meta:
        model = VendorMasterProductService
        fields = [
            'vendor_basic_detail',
            'hsn_sac_code',
            'item_code',
            'item_name',
            'supplier_item_code',
            'supplier_item_name'
        ]
    
    def validate_item_name(self, value):
        """Validate item name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Item Name cannot be empty")
        return value.strip()


class VendorProductServiceUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating vendor product/service.
    """
    
    class Meta:
        model = VendorMasterProductService
        fields = [
            'hsn_sac_code',
            'item_code',
            'item_name',
            'supplier_item_code',
            'supplier_item_name',
            'is_active'
        ]
