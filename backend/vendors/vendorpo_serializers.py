"""
Serializers for Vendor Purchase Order Transactions
"""
from rest_framework import serializers
from .models import VendorTransactionPO, VendorTransactionPOItem


class VendorPOItemSerializer(serializers.ModelSerializer):
    """
    Serializer for Purchase Order Items
    """
    
    class Meta:
        model = VendorTransactionPOItem
        fields = [
            'id',
            'tenant_id',
            'po',
            'item_code',
            'item_name',
            'supplier_item_code',
            'quantity',
            'uom',
            'negotiated_rate',
            'final_rate',
            'taxable_value',
            'gst_rate',
            'gst_amount',
            'invoice_value',
            'is_active',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class VendorPOSerializer(serializers.ModelSerializer):
    """
    Serializer for Purchase Orders with nested items
    """
    items = VendorPOItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = VendorTransactionPO
        fields = [
            'id',
            'tenant_id',
            'po_number',
            'po_series',
            'vendor_basic_detail',
            'vendor_name',
            'branch',
            'address_line1',
            'address_line2',
            'address_line3',
            'city',
            'state',
            'country',
            'pincode',
            'email_address',
            'contract_no',
            'receive_by',
            'receive_at',
            'delivery_terms',
            'total_taxable_value',
            'total_tax',
            'total_value',
            'status',
            'is_active',
            'created_at',
            'updated_at',
            'created_by',
            'updated_by',
            'items'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class VendorPOCreateSerializer(serializers.Serializer):
    """
    Serializer for creating Purchase Orders with items
    """
    # PO Header fields
    po_series_id = serializers.IntegerField(required=False, allow_null=True)
    vendor_id = serializers.IntegerField(required=False, allow_null=True)
    vendor_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    branch = serializers.CharField(max_length=200, required=False, allow_blank=True)
    address_line1 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    address_line2 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    address_line3 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    country = serializers.CharField(max_length=100, required=False, allow_blank=True)
    pincode = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email_address = serializers.EmailField(max_length=255, required=False, allow_blank=True)
    contract_no = serializers.CharField(max_length=100, required=False, allow_blank=True)
    receive_by = serializers.DateField(required=False, allow_null=True)
    receive_at = serializers.CharField(max_length=200, required=False, allow_blank=True)
    delivery_terms = serializers.CharField(required=False, allow_blank=True)
    
    # PO Items
    items = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        allow_empty=True
    )
    
    def validate_items(self, value):
        """
        Validate PO items
        """
        if not value:
            return []
        
        for item in value:
            if not item.get('item_name'):
                raise serializers.ValidationError("Each item must have an item_name")
        
        return value
