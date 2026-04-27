"""
Serializers for Vendor Master GST Details.
"""

from rest_framework import serializers
from .models import VendorMasterGSTDetails


class VendorGSTDetailsSerializer(serializers.ModelSerializer):
    """
    Main serializer for VendorMasterGSTDetails model with all fields.
    """
    
    class Meta:
        model = VendorMasterGSTDetails
        fields = [
            'id',
            'tenant_id',
            'vendor_basic_detail',
            'gstin',
            'gst_registration_type',
            'legal_name',
            'trade_name',
            'gst_state',
            'gst_state_code',
            'pan_linked_with_gstin',
            'date_of_registration',
            'is_active',
            'created_at',
            'updated_at',
            'created_by',
            'updated_by',
            'reference_name',
            'branch_address',
            'branch_address_line1',
            'branch_address_line2',
            'branch_address_line3',
            'branch_contact_person',
            'branch_email',
            'branch_contact_no',
            'branch_pincode',
            'branch_city',
            'branch_state',
            'branch_country'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class VendorGSTDetailsCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating vendor GST details.
    """
    gstin = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    
    class Meta:
        model = VendorMasterGSTDetails
        fields = [
            'vendor_basic_detail',
            'gstin',
            'gst_registration_type',
            'legal_name',
            'trade_name',
            'reference_name',
            'branch_address',
            'branch_address_line1',
            'branch_address_line2',
            'branch_address_line3',
            'branch_contact_person',
            'branch_email',
            'branch_contact_no',
            'branch_pincode',
            'branch_city',
            'branch_state',
            'branch_country'
        ]
    
    def validate_gstin(self, value):
        """Normalize GSTIN to uppercase and trim whitespace."""
        return (value or '').upper().strip()
    
    def validate(self, attrs):
        """Allow blank GSTIN only for unregistered vendors."""
        registration_type = (attrs.get('gst_registration_type') or 'regular').strip().lower()
        gstin = (attrs.get('gstin') or '').strip().upper()
        attrs['gstin'] = gstin

        if registration_type == 'unregistered':
            return attrs

        if not gstin:
            raise serializers.ValidationError({'gstin': 'GSTIN is required for registered vendors'})
        if len(gstin) != 15:
            raise serializers.ValidationError({'gstin': 'GSTIN must be exactly 15 characters'})
        if not gstin[:2].isdigit():
            raise serializers.ValidationError({'gstin': 'First 2 characters must be state code (digits)'})
        if not gstin[2:12].isalnum():
            raise serializers.ValidationError({'gstin': 'Characters 3-12 must be PAN (alphanumeric)'})

        return attrs
    
    def validate_legal_name(self, value):
        """Validate legal name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Legal name cannot be empty")
        return value.strip()


class VendorGSTDetailsUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating vendor GST details.
    """
    gstin = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    
    class Meta:
        model = VendorMasterGSTDetails
        fields = [
            'gstin',
            'gst_registration_type',
            'legal_name',
            'trade_name',
            'reference_name',
            'branch_address',
            'branch_address_line1',
            'branch_address_line2',
            'branch_address_line3',
            'branch_contact_person',
            'branch_email',
            'branch_contact_no',
            'branch_pincode',
            'branch_city',
            'branch_state',
            'branch_country',
            'is_active'
        ]
    
    def validate_legal_name(self, value):
        """Validate legal name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Legal name cannot be empty")
        return value.strip()
    
    def validate(self, attrs):
        """Allow blank GSTIN only when registration type is unregistered."""
        instance = getattr(self, 'instance', None)
        registration_type = (attrs.get('gst_registration_type') or getattr(instance, 'gst_registration_type', 'regular')).strip().lower()
        gstin = attrs.get('gstin')
        if gstin is None:
            gstin = getattr(instance, 'gstin', '')
        gstin = (gstin or '').strip().upper()
        attrs['gstin'] = gstin

        if registration_type == 'unregistered':
            return attrs

        if not gstin:
            raise serializers.ValidationError({'gstin': 'GSTIN is required for registered vendors'})
        if len(gstin) != 15:
            raise serializers.ValidationError({'gstin': 'GSTIN must be exactly 15 characters'})
        if not gstin[:2].isdigit():
            raise serializers.ValidationError({'gstin': 'First 2 characters must be state code (digits)'})
        if not gstin[2:12].isalnum():
            raise serializers.ValidationError({'gstin': 'Characters 3-12 must be PAN (alphanumeric)'})

        return attrs


class VendorGSTDetailsListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing vendor GST details.
    """
    
    class Meta:
        model = VendorMasterGSTDetails
        fields = [
            'id',
            'vendor_basic_detail',
            'gstin',
            'gst_registration_type',
            'legal_name',
            'trade_name',
            'reference_name',
            'branch_address',
            'branch_address_line1',
            'branch_address_line2',
            'branch_address_line3',
            'branch_contact_person',
            'branch_email',
            'branch_contact_no',
            'branch_pincode',
            'branch_city',
            'branch_state',
            'branch_country',
            'gst_state',
            'gst_state_code',
            'is_active'
        ]
