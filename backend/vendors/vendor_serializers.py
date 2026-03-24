"""
Serializers for Vendor management.
"""

from rest_framework import serializers
from .models import Vendor, VendorMasterCategory


class VendorSerializer(serializers.ModelSerializer):
    """
    Main serializer for Vendor model with all fields.
    """
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    category_full_path = serializers.CharField(source='category.full_path', read_only=True, allow_null=True)
    full_billing_address = serializers.SerializerMethodField()
    full_shipping_address = serializers.SerializerMethodField()
    
    class Meta:
        model = Vendor
        fields = [
            'id',
            'tenant_id',
            'vendor_code',
            'vendor_name',
            'display_name',
            'vendor_type',
            'contact_person',
            'email',
            'phone',
            'mobile',
            'website',
            'billing_address_line1',
            'billing_address_line2',
            'billing_city',
            'billing_state',
            'billing_country',
            'billing_pincode',
            'full_billing_address',
            'shipping_address_line1',
            'shipping_address_line2',
            'shipping_city',
            'shipping_state',
            'shipping_country',
            'shipping_pincode',
            'full_shipping_address',
            'gstin',
            'pan',
            'tax_id',
            'payment_terms',
            'credit_limit',
            'credit_days',
            'bank_name',
            'bank_account_number',
            'bank_ifsc',
            'bank_branch',
            'category',
            'category_name',
            'category_full_path',
            'notes',
            'opening_balance',
            'current_balance',
            'is_active',
            'is_verified',
            'created_at',
            'updated_at',
            'created_by',
            'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at', 'current_balance']
    
    def get_full_billing_address(self, obj):
        """Get formatted billing address"""
        return obj.get_full_billing_address()
    
    def get_full_shipping_address(self, obj):
        """Get formatted shipping address"""
        return obj.get_full_shipping_address()


class VendorCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating vendors.
    """
    category = serializers.PrimaryKeyRelatedField(
        queryset=VendorMasterCategory.objects.all(),
        required=False,
        allow_null=True
    )
    
    class Meta:
        model = Vendor
        fields = [
            'vendor_code',
            'vendor_name',
            'display_name',
            'vendor_type',
            'contact_person',
            'email',
            'phone',
            'mobile',
            'website',
            'billing_address_line1',
            'billing_address_line2',
            'billing_city',
            'billing_state',
            'billing_country',
            'billing_pincode',
            'shipping_address_line1',
            'shipping_address_line2',
            'shipping_city',
            'shipping_state',
            'shipping_country',
            'shipping_pincode',
            'gstin',
            'pan',
            'tax_id',
            'payment_terms',
            'credit_limit',
            'credit_days',
            'bank_name',
            'bank_account_number',
            'bank_ifsc',
            'bank_branch',
            'category',
            'notes',
            'opening_balance',
            'is_verified'
        ]
    
    def validate_vendor_name(self, value):
        """Validate vendor name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Vendor name cannot be empty")
        return value.strip()
    
    def validate_email(self, value):
        """Validate email format"""
        if value and '@' not in value:
            raise serializers.ValidationError("Enter a valid email address")
        return value
    
    def validate_gstin(self, value):
        """Validate GSTIN format (15 characters)"""
        if value and len(value) != 15:
            raise serializers.ValidationError("GSTIN must be 15 characters")
        return value
    
    def validate_pan(self, value):
        """Validate PAN format (10 characters)"""
        if value and len(value) != 10:
            raise serializers.ValidationError("PAN must be 10 characters")
        return value
    
    def validate_credit_limit(self, value):
        """Validate credit limit is positive"""
        if value is not None and value < 0:
            raise serializers.ValidationError("Credit limit cannot be negative")
        return value
    
    def validate_opening_balance(self, value):
        """Validate opening balance"""
        if value is None:
            return 0.00
        return value

    def create(self, validated_data):
        """Create vendor and link ledger"""
        from accounting.utils_ledger import get_or_create_entity_ledger
        from django.db import transaction
        
        with transaction.atomic():
            ledger = get_or_create_entity_ledger(
                tenant_id=validated_data.get('tenant_id'),
                entity_name=validated_data.get('vendor_name'),
                entity_type='vendor',
                created_by=validated_data.get('created_by')
            )
            validated_data['ledger'] = ledger
            return super().create(validated_data)


class VendorUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating vendors.
    """
    category = serializers.PrimaryKeyRelatedField(
        queryset=VendorMasterCategory.objects.all(),
        required=False,
        allow_null=True
    )
    
    class Meta:
        model = Vendor
        fields = [
            'vendor_code',
            'vendor_name',
            'display_name',
            'vendor_type',
            'contact_person',
            'email',
            'phone',
            'mobile',
            'website',
            'billing_address_line1',
            'billing_address_line2',
            'billing_city',
            'billing_state',
            'billing_country',
            'billing_pincode',
            'shipping_address_line1',
            'shipping_address_line2',
            'shipping_city',
            'shipping_state',
            'shipping_country',
            'shipping_pincode',
            'gstin',
            'pan',
            'tax_id',
            'payment_terms',
            'credit_limit',
            'credit_days',
            'bank_name',
            'bank_account_number',
            'bank_ifsc',
            'bank_branch',
            'category',
            'notes',
            'is_active',
            'is_verified'
        ]

    def update(self, instance, validated_data):
        """Update vendor and ensure ledger link"""
        from accounting.utils_ledger import get_or_create_entity_ledger
        from django.db import transaction
        
        with transaction.atomic():
            ledger = get_or_create_entity_ledger(
                tenant_id=instance.tenant_id,
                entity_name=validated_data.get('vendor_name', instance.vendor_name),
                entity_type='vendor',
                created_by=validated_data.get('updated_by', instance.updated_by)
            )
            validated_data['ledger'] = ledger
            return super().update(instance, validated_data)

    def validate_vendor_name(self, value):
        """Validate vendor name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Vendor name cannot be empty")
        return value.strip()
    
    def validate_email(self, value):
        """Validate email format"""
        if value and '@' not in value:
            raise serializers.ValidationError("Enter a valid email address")
        return value
    
    def validate_credit_limit(self, value):
        """Validate credit limit is positive"""
        if value is not None and value < 0:
            raise serializers.ValidationError("Credit limit cannot be negative")
        return value


class VendorListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing vendors.
    """
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    
    class Meta:
        model = Vendor
        fields = [
            'id',
            'vendor_code',
            'vendor_name',
            'display_name',
            'vendor_type',
            'contact_person',
            'email',
            'phone',
            'category',
            'category_name',
            'current_balance',
            'payment_terms',
            'is_active',
            'is_verified'
        ]


class VendorSummarySerializer(serializers.ModelSerializer):
    """
    Minimal serializer for dropdowns and quick references.
    """
    class Meta:
        model = Vendor
        fields = [
            'id',
            'vendor_code',
            'vendor_name',
            'display_name',
            'email',
            'phone'
        ]


class VendorBalanceSerializer(serializers.Serializer):
    """
    Serializer for vendor balance operations.
    """
    amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    operation = serializers.ChoiceField(choices=['add', 'subtract'])
    
    def validate_amount(self, value):
        """Validate amount is positive"""
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than 0")
        return value


class VendorStatisticsSerializer(serializers.Serializer):
    """
    Serializer for vendor statistics.
    """
    total_vendors = serializers.IntegerField()
    active_vendors = serializers.IntegerField()
    verified_vendors = serializers.IntegerField()
    total_outstanding = serializers.DecimalField(max_digits=15, decimal_places=2)
    vendors_by_type = serializers.DictField()
