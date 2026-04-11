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
        """Validate GSTIN format (15 characters)"""
        if not value:
            raise serializers.ValidationError("GSTIN is required")
        
        value = value.upper().strip()
        
        if len(value) != 15:
            raise serializers.ValidationError("GSTIN must be exactly 15 characters")
        
        # Basic GSTIN format validation
        # Format: 2 digits (state code) + 10 chars (PAN) + 1 char (entity number) + 1 char (Z) + 1 char (checksum)
        if not value[:2].isdigit():
            raise serializers.ValidationError("First 2 characters must be state code (digits)")
        
        if not value[2:12].isalnum():
            raise serializers.ValidationError("Characters 3-12 must be PAN (alphanumeric)")
        
        return value
    
    def validate_legal_name(self, value):
        """Validate legal name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Legal name cannot be empty")
        return value.strip()


class VendorGSTDetailsUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating vendor GST details.
    """
    
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
