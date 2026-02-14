"""
Serializers for Service models.
"""

from rest_framework import serializers
from .models import Service, ServiceGroup


class ServiceGroupSerializer(serializers.ModelSerializer):
    """
    Serializer for Service Group
    """
    class Meta:
        model = ServiceGroup
        fields = ['id', 'tenant_id', 'category', 'group', 'subgroup', 'is_active']
        read_only_fields = ['id', 'tenant_id']


class ServiceSerializer(serializers.ModelSerializer):
    """
    Serializer for Service model with complete field validation.
    Supports both camelCase (frontend) and snake_case (backend) field names.
    """
    
    # Accept camelCase fields from frontend and map to snake_case model fields
    serviceName = serializers.CharField(source='service_name', write_only=True)
    serviceGroup = serializers.CharField(source='service_group', write_only=True)
    serviceCode = serializers.CharField(source='service_code', write_only=True)
    sacCode = serializers.CharField(source='sac_code', write_only=True)
    gstRate = serializers.DecimalField(source='gst_rate', max_digits=5, decimal_places=2, write_only=True)
    expenseLedger = serializers.CharField(source='expense_ledger', write_only=True)
    
    class Meta:
        model = Service
        fields = [
            'id', 'tenant_id',
            # Write-only camelCase fields (from frontend)
            'serviceName', 'serviceCode', 'serviceGroup', 'sacCode', 
            'gstRate', 'expenseLedger',
            # Model fields for read operations
            'service_code', 'service_name', 'service_group', 'sac_code',
            'gst_rate', 'expense_ledger',
            'uom', 'description', 'is_active', 'created_at', 'updated_at', 'tenant_id'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
        extra_kwargs = {
            # Make snake_case fields read-only to avoid duplication
            'service_code': {'read_only': True},
            'service_name': {'read_only': True},
            'service_group': {'read_only': True},
            'sac_code': {'read_only': True},
            'gst_rate': {'read_only': True},
            'expense_ledger': {'read_only': True},
        }
    
    def validate_service_code(self, value):
        """Ensure service code is unique and properly formatted"""
        if value:
            value = value.strip().upper()
        return value
    
    def validate_gst_rate(self, value):
        """Ensure GST rate is between 0 and 100"""
        if value < 0 or value > 100:
            raise serializers.ValidationError("GST rate must be between 0 and 100")
        return value
    
    def validate(self, data):
        """
        Cross-field validation - check required fields
        """
        required_fields = {
            'service_code': 'Service Code',
            'service_name': 'Service Name',
            'service_group': 'Service Group',
            'sac_code': 'SAC Code',
            'expense_ledger': 'Expense Ledger'
        }
        
        errors = {}
        for field, display_name in required_fields.items():
            if field not in data or not data[field]:
                errors[field] = f"{display_name} is required"
        
        if errors:
            raise serializers.ValidationError(errors)
        
        return data
    
    def to_representation(self, instance):
        """
        Convert model instance to camelCase JSON for frontend.
        """
        return {
            'id': instance.id,
            'tenantId': instance.tenant_id,
            'serviceCode': instance.service_code,
            'serviceName': instance.service_name,
            'serviceGroup': instance.service_group,
            'sacCode': instance.sac_code,
            'gstRate': float(instance.gst_rate),
            'uom': instance.uom,
            'description': instance.description,
            'expenseLedger': instance.expense_ledger,
            'isActive': instance.is_active,
            'createdAt': instance.created_at.isoformat() if instance.created_at else None,
            'updatedAt': instance.updated_at.isoformat() if instance.updated_at else None,
        }

