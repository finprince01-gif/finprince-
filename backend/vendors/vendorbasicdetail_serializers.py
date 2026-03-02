"""
Serializers for Vendor Master Basic Details.
"""

from rest_framework import serializers
from .models import VendorMasterBasicDetail


class VendorBasicDetailSerializer(serializers.ModelSerializer):
    """
    Main serializer for VendorMasterBasicDetail model with all fields.
    """
    
    class Meta:
        model = VendorMasterBasicDetail
        fields = [
            'id',
            'tenant_id',
            'vendor_code',
            'vendor_name',
            'pan_no',
            'contact_person',
            'email',
            'contact_no',
            'vendor_category',
            'billing_currency',
            'is_also_customer',
            'tcs_applicable',
            'is_active',
            'created_at',
            'updated_at',
            'created_by',
            'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class VendorBasicDetailCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating vendor basic details.
    """
    
    class Meta:
        model = VendorMasterBasicDetail
        fields = [
            'vendor_code',
            'vendor_name',
            'pan_no',
            'contact_person',
            'email',
            'contact_no',
            'vendor_category',
            'billing_currency',
            'is_also_customer',
            'tcs_applicable'
        ]
    
    def validate_vendor_name(self, value):
        """Validate vendor name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Vendor name cannot be empty")
        return value.strip()
    
    def validate_email(self, value):
        """Validate email format"""
        if not value or '@' not in value:
            raise serializers.ValidationError("Enter a valid email address")
        return value.lower()
    
    def validate_contact_no(self, value):
        """Validate contact number"""
        if not value:
            raise serializers.ValidationError("Contact number is required")
        # Remove spaces and special characters for validation
        cleaned = value.replace(' ', '').replace('-', '').replace('+', '')
        if not cleaned.isdigit():
            raise serializers.ValidationError("Contact number should contain only digits")
        return value
    
    def validate_pan_no(self, value):
        """Validate PAN number format (10 characters)"""
        if value:
            value = value.upper().strip()
            if len(value) != 10:
                raise serializers.ValidationError("PAN must be 10 characters")
            # Basic PAN format validation: 5 letters, 4 digits, 1 letter
            if not (value[:5].isalpha() and value[5:9].isdigit() and value[9].isalpha()):
                raise serializers.ValidationError("Invalid PAN format")
        return value


class VendorBasicDetailUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating vendor basic details.
    """
    
    class Meta:
        model = VendorMasterBasicDetail
        fields = [
            'vendor_name',
            'pan_no',
            'contact_person',
            'email',
            'contact_no',
            'vendor_category',
            'billing_currency',
            'is_also_customer',
            'tcs_applicable',
            'is_active'
        ]
    
    def validate_vendor_name(self, value):
        """Validate vendor name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Vendor name cannot be empty")
        return value.strip()
    
    def validate_email(self, value):
        """Validate email format"""
        if not value or '@' not in value:
            raise serializers.ValidationError("Enter a valid email address")
        return value.lower()


    def to_representation(self, instance):
        """
        Flatten terms and conditions into the response
        """
        data = super().to_representation(instance)
        
        # Access terms_conditions via related_name check if it exists
        # In the model, related_name is 'terms_conditions'
        terms = None
        if hasattr(instance, 'terms_conditions'):
            # It's a related manager if many=True, but here it's likely a 1-to-1 or filtered 1-to-many
            # Looking at the model, it's a ForeignKey with related_name='terms_conditions'
            # So instance.terms_conditions is a manager.
            terms = instance.terms_conditions.filter(is_active=True).first()
            
        data.update({
            'credit_limit': float(terms.credit_limit) if terms and terms.credit_limit else None,
            'credit_period': terms.credit_period if terms else None,
            'credit_terms': terms.credit_terms if terms else None,
            'penalty_terms': terms.penalty_terms if terms else None,
            'delivery_terms': terms.delivery_terms if terms else None,
            'warranty_guarantee_details': terms.warranty_guarantee_details if terms else None,
            'force_majeure': terms.force_majeure if terms else None,
            'dispute_redressal_terms': terms.dispute_redressal_terms if terms else None,
        })
        
        return data


class VendorBasicDetailListSerializer(serializers.ModelSerializer):

    """
    Lightweight serializer for listing vendor basic details.
    """
    
    class Meta:
        model = VendorMasterBasicDetail
        fields = [
            'id',
            'vendor_code',
            'vendor_name',
            'email',
            'contact_no',
            'pan_no',
            'billing_currency',
            'is_also_customer',
            'is_active'
        ]


    def to_representation(self, instance):
        """
        Flatten terms and conditions into the response
        """
        data = super().to_representation(instance)
        
        terms = None
        if hasattr(instance, 'terms_conditions'):
            terms = instance.terms_conditions.filter(is_active=True).first()
            
        data.update({
            'credit_limit': float(terms.credit_limit) if terms and terms.credit_limit else None,
            'credit_period': terms.credit_period if terms else None,
            'credit_terms': terms.credit_terms if terms else None,
            'penalty_terms': terms.penalty_terms if terms else None,
            'delivery_terms': terms.delivery_terms if terms else None,
            'warranty_guarantee_details': terms.warranty_guarantee_details if terms else None,
            'force_majeure': terms.force_majeure if terms else None,
            'dispute_redressal_terms': terms.dispute_redressal_terms if terms else None,
        })
        
        return data


class VendorBasicDetailSummarySerializer(serializers.ModelSerializer):

    """
    Minimal serializer for dropdowns and quick references.
    """
    
    class Meta:
        model = VendorMasterBasicDetail
        fields = [
            'id',
            'vendor_code',
            'vendor_name',
            'email',
            'contact_no'
        ]


class VendorBasicDetailStatisticsSerializer(serializers.Serializer):
    """
    Serializer for vendor basic detail statistics.
    """
    total_vendors = serializers.IntegerField()
    active_vendors = serializers.IntegerField()
    inactive_vendors = serializers.IntegerField()
    also_customers = serializers.IntegerField()
