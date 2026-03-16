"""
Masters Serializers - Data Validation
Handles serialization and validation for Masters module.
"""

from rest_framework import serializers  # type: ignore
from .models import MasterVoucherSales as VoucherConfiguration  # type: ignore


class VoucherConfigurationSerializer(serializers.ModelSerializer):
    """
    Serializer for Voucher Configuration.
    Handles all voucher types with automatic numbering configuration.
    """
    voucher_type = serializers.SerializerMethodField()
    
    class Meta:
        model = VoucherConfiguration
        fields = [
            'id',
            'voucher_name',
            'voucher_type',
            'prefix',
            'suffix',
            'start_from',
            'current_number',
            'required_digits',
            'enable_auto_numbering',
            'include_from_existing_series',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'current_number', 'created_at', 'updated_at']

    def get_voucher_type(self, obj):
        # Infer type from table name or model class
        table_name = obj._meta.db_table
        if 'sales' in table_name: return 'sales'
        if 'receipt' in table_name: return 'receipts'
        if 'payment' in table_name: return 'payments'
        if 'purchase' in table_name: return 'purchase'
        if 'creditnote' in table_name: return 'creditnote'
        if 'debitnote' in table_name: return 'debitnote'
        if 'expense' in table_name: return 'expenses'
        if 'journal' in table_name: return 'journal'
        if 'contra' in table_name: return 'contra'
        return 'unknown'
    
    def validate(self, data):
        """Custom validation for voucher configuration."""
        # Validate required_digits
        if data.get('required_digits', 0) < 1:
            raise serializers.ValidationError({
                'required_digits': 'Required digits must be at least 1'
            })
        
        # Validate start_from
        if data.get('start_from', 0) < 1:
            raise serializers.ValidationError({
                'start_from': 'Start From must be at least 1'
            })
        
        return data
    
    def create(self, validated_data):
        """Create voucher configuration with current_number set to start_from."""
        # Set current_number to start_from initially
        validated_data['current_number'] = validated_data.get('start_from', 1)
        return super().create(validated_data)

# Alias for backward compatibility
MasterVoucherConfigSerializer = VoucherConfigurationSerializer

