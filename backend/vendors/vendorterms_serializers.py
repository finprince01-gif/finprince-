"""
Serializers for Vendor Master Terms & Conditions
"""
from rest_framework import serializers
from .models import VendorMasterTerms


class VendorMasterTermsSerializer(serializers.ModelSerializer):
    """
    Serializer for Vendor Master Terms & Conditions
    """
    
    class Meta:
        model = VendorMasterTerms
        fields = [
            'id',
            'tenant_id',
            'vendor_basic_detail',
            'credit_limit',
            'credit_period',
            'credit_terms',
            'penalty_terms',
            'delivery_terms',
            'warranty_guarantee_details',
            'force_majeure',
            'dispute_redressal_terms',
            'is_active',
            'created_at',
            'updated_at',
            'created_by',
            'updated_by'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate(self, data):
        """
        Validate the terms data
        """
        # Ensure credit_limit is positive if provided
        if data.get('credit_limit') is not None and data['credit_limit'] < 0:
            raise serializers.ValidationError({
                'credit_limit': 'Credit limit must be a positive number'
            })
        
        return data
