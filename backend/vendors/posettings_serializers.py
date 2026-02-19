"""
Serializers for Vendor Master PO Settings.
"""

from rest_framework import serializers
from .models import VendorMasterPOSettings
from .models import VendorMasterPOSettings, VendorMasterCategory


class VendorMasterPOSettingsSerializer(serializers.ModelSerializer):
    """
    Serializer for reading VendorMasterPOSettings data.
    Includes category details.
    """
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    category_full_path = serializers.CharField(source='category.full_path', read_only=True, allow_null=True)
    preview_po_number = serializers.SerializerMethodField()
    
    class Meta:
        model = VendorMasterPOSettings
        fields = [
            'id',
            'tenant_id',
            'name',
            'category',
            'category_name',
            'category_full_path',
            'prefix',
            'suffix',
            'digits',
            'auto_year',
            'current_number',
            'preview_po_number',
            'is_active',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
    
    def get_preview_po_number(self, obj):
        """Generate a preview of the next PO number"""
        return obj.generate_po_number()


class VendorMasterPOSettingsCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating VendorMasterPOSettings.
    """
    category = serializers.PrimaryKeyRelatedField(
        queryset=VendorMasterCategory.objects.all(),
        required=False,
        allow_null=True
    )
    
    class Meta:
        model = VendorMasterPOSettings
        fields = [
            'name',
            'category',
            'prefix',
            'suffix',
            'digits',
            'auto_year'
        ]
    
    def validate_name(self, value):
        """Validate that name is not empty"""
        if not value or not value.strip():
            raise serializers.ValidationError("Name cannot be empty")
        return value.strip()
    
    def validate_digits(self, value):
        """Validate that digits is between 1 and 10"""
        if value < 1 or value > 10:
            raise serializers.ValidationError("Digits must be between 1 and 10")
        return value
    
    def validate_prefix(self, value):
        """Validate prefix length"""
        if value and len(value) > 50:
            raise serializers.ValidationError("Prefix cannot exceed 50 characters")
        return value
    
    def validate_suffix(self, value):
        """Validate suffix length"""
        if value and len(value) > 50:
            raise serializers.ValidationError("Suffix cannot exceed 50 characters")
        return value


class VendorMasterPOSettingsUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating VendorMasterPOSettings.
    """
    category = serializers.PrimaryKeyRelatedField(
        queryset=VendorMasterCategory.objects.all(),
        required=False,
        allow_null=True
    )
    
    class Meta:
        model = VendorMasterPOSettings
        fields = [
            'name',
            'category',
            'prefix',
            'suffix',
            'digits',
            'auto_year',
            'current_number',
            'is_active'
        ]
    
    def validate_name(self, value):
        """Validate that name is not empty"""
        if not value or not value.strip():
            raise serializers.ValidationError("Name cannot be empty")
        return value.strip()
    
    def validate_digits(self, value):
        """Validate that digits is between 1 and 10"""
        if value < 1 or value > 10:
            raise serializers.ValidationError("Digits must be between 1 and 10")
        return value
    
    def validate_current_number(self, value):
        """Validate that current_number is positive"""
        if value < 1:
            raise serializers.ValidationError("Current number must be at least 1")
        return value


class VendorMasterPOSettingsListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing PO settings.
    """
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    
    class Meta:
        model = VendorMasterPOSettings
        fields = [
            'id',
            'name',
            'category',
            'category_name',
            'prefix',
            'suffix',
            'digits',
            'auto_year',
            'is_active'
        ]
