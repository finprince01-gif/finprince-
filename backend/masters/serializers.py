"""
Masters Serializers - Data Validation
Handles serialization and validation for Masters module.
"""

from rest_framework import serializers
from accounting.models import VoucherConfiguration


class VoucherConfigurationSerializer(serializers.ModelSerializer):
    """
    Serializer for Voucher Configuration.
    Handles all voucher types with automatic numbering configuration.
    """
    
    class Meta:
        model = VoucherConfiguration
        fields = [
            'id',
            'voucher_type',
            'voucher_name',
            'enable_auto_numbering',
            'prefix',
            'suffix',
            'start_from',
            'current_number',
            'required_digits',
            'include_from_existing_series_id',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'current_number', 'created_at', 'updated_at']
    
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
