from rest_framework import serializers
from .models import VendorMasterBanking


class VendorMasterBankingSerializer(serializers.ModelSerializer):
    """
    Serializer for Vendor Master Banking Information.
    """
    
    # Override fields to make them optional
    bank_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    ifsc_code = serializers.CharField(max_length=11, required=False, allow_blank=True)
    
    class Meta:
        model = VendorMasterBanking
        fields = [
            'id',
            'tenant_id',
            'vendor_basic_detail',
            'bank_account_no',
            'bank_name',
            'ifsc_code',
            'branch_name',
            'swift_code',
            'vendor_branch',
            'account_type',
            'is_active',
            'created_at',
            'updated_at',
            'created_by',
            'updated_by',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_ifsc_code(self, value):
        """Validate IFSC code format"""
        if value and value.strip() and len(value) != 11:
            raise serializers.ValidationError("IFSC code must be exactly 11 characters")
        return value.upper() if value and value.strip() else value
    
    def validate_swift_code(self, value):
        """Validate SWIFT code format"""
        if value and value.strip() and (len(value) < 8 or len(value) > 11):
            raise serializers.ValidationError("SWIFT code must be 8 or 11 characters")
        return value.upper() if value and value.strip() else value
    
    def validate_bank_account_no(self, value):
        """Validate bank account number"""
        if not value or not value.strip():
            raise serializers.ValidationError("Bank account number is required")
        return value
