# pyre-ignore-all-errors
from rest_framework import serializers  # type: ignore
from .models import VendorMasterCategory  # type: ignore


class VendorMasterCategorySerializer(serializers.ModelSerializer):
    """
    Serializer for Vendor Master Category
    """
    full_path = serializers.ReadOnlyField()
    group = serializers.CharField(required=False, allow_null=True, allow_blank=True, default='')
    subgroup = serializers.CharField(required=False, allow_null=True, allow_blank=True, default='')
    
    class Meta:
        model = VendorMasterCategory
        fields = [
            'id',
            'tenant_id',
            'category',
            'group',
            'subgroup',
            'full_path',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at', 'full_path']

    def validate_group(self, value):
        return value if value is not None else ''

    def validate_subgroup(self, value):
        return value if value is not None else ''
