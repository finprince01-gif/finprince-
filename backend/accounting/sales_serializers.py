"""
Sales Voucher Serializers
Handles serialization/deserialization of sales voucher data.
"""

from rest_framework import serializers
from accounting.models import (
    SalesVoucher,
    SalesVoucherItem,
    SalesVoucherDocument,
    ReceiptVoucherType,
    MasterLedger,
    VoucherConfiguration
)


class ReceiptVoucherTypeSerializer(serializers.ModelSerializer):
    """Serializer for Receipt Voucher Types"""
    
    class Meta:
        model = ReceiptVoucherType
        fields = ['id', 'name', 'code', 'description', 'is_active', 'display_order']
        read_only_fields = ['id']


class VoucherConfigurationDropdownSerializer(serializers.ModelSerializer):
    """Serializer for Voucher Configuration in Dropdown"""
    name = serializers.CharField(source='voucher_name', read_only=True)
    code = serializers.CharField(source='voucher_type', read_only=True)
    
    class Meta:
        model = VoucherConfiguration
        fields = [
            'id', 'name', 'code', 'is_active', 
            'prefix', 'suffix', 'current_number', 'required_digits', 'enable_auto_numbering'
        ]


class SalesVoucherItemSerializer(serializers.ModelSerializer):
    """Serializer for Sales Voucher Items"""
    
    class Meta:
        model = SalesVoucherItem
        fields = [
            'id', 'item_name', 'hsn_code', 'quantity', 'unit', 'rate',
            'taxable_amount', 'cgst_rate', 'cgst_amount', 'sgst_rate', 'sgst_amount',
            'igst_rate', 'igst_amount', 'total_amount', 'line_number'
        ]
        read_only_fields = ['id', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_amount']


class SalesVoucherDocumentSerializer(serializers.ModelSerializer):
    """Serializer for Sales Voucher Documents"""
    
    class Meta:
        model = SalesVoucherDocument
        fields = ['id', 'file_name', 'file_path', 'file_type', 'file_size', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at']


class SalesVoucherListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for Sales Voucher list/dropdowns"""
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    voucher_type_name = serializers.CharField(source='voucher_type.name', read_only=True)

    class Meta:
        model = SalesVoucher
        fields = [
            'id', 'date', 'sales_invoice_number', 'customer', 'customer_name', 
            'voucher_type', 'voucher_type_name', 'grand_total', 'status'
        ]
        read_only_fields = fields


class SalesVoucherSerializer(serializers.ModelSerializer):
    """Serializer for Sales Voucher"""
    
    items = SalesVoucherItemSerializer(many=True, read_only=True)
    documents = SalesVoucherDocumentSerializer(many=True, read_only=True)
    voucher_type_name = serializers.CharField(source='voucher_type.name', read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    
    class Meta:
        model = SalesVoucher
        fields = [
            'id', 'date', 'voucher_type', 'voucher_type_name', 'sales_invoice_number',
            'customer', 'customer_name', 'bill_to_address', 'bill_to_gstin', 'bill_to_contact',
            'bill_to_state', 'bill_to_country', 'ship_to_address', 'ship_to_state', 'ship_to_country',
            'tax_type', 
            # GST-Compliant Fields
            'place_of_supply', 'reverse_charge', 'invoice_type', 'export_type',
            'port_code', 'shipping_bill_number', 'shipping_bill_date', 'ecommerce_gstin',
            # Status and Totals
            'status', 'current_step', 'total_taxable_amount', 'total_cgst',
            'total_sgst', 'total_igst', 'grand_total', 'payment_details', 'dispatch_details',
            'einvoice_details', 'items', 'documents', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'sales_invoice_number', 'tax_type', 'total_taxable_amount',
            'total_cgst', 'total_sgst', 'total_igst', 'grand_total', 'created_at', 'updated_at'
        ]


class SalesVoucherCreateSerializer(serializers.Serializer):
    """Serializer for creating a new sales voucher"""
    
    date = serializers.DateField()
    voucher_type_id = serializers.IntegerField()
    customer_id = serializers.IntegerField()
    ship_to_address = serializers.CharField(required=False, allow_blank=True)
    items = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        allow_empty=True
    )
    
    def validate_date(self, value):
        """Validate that date is not in future"""
        from django.utils import timezone
        
        if value > timezone.now().date():
            raise serializers.ValidationError("Future dates are not allowed. Date must be today or a past date.")
        
        return value
    
    def validate_voucher_type_id(self, value):
        """Validate that voucher type OR configuration exists"""
        tenant_id = self.context.get('tenant_id')
        
        # Check ReceiptVoucherType
        type_exists = ReceiptVoucherType.objects.filter(
            id=value, tenant_id=tenant_id, is_active=True
        ).exists()
        
        # Check VoucherConfiguration
        config_exists = VoucherConfiguration.objects.filter(
            id=value, tenant_id=tenant_id, is_active=True
        ).exists()
        
        if not (type_exists or config_exists):
            raise serializers.ValidationError("Invalid voucher type or configuration.")
        
        return value
    
    def validate_customer_id(self, value):
        """Validate that customer exists"""
        tenant_id = self.context.get('tenant_id')
        
        if not MasterLedger.objects.filter(id=value, tenant_id=tenant_id).exists():
            raise serializers.ValidationError("Invalid customer.")
        
        return value


class CustomerAddressSerializer(serializers.Serializer):
    """Serializer for customer address response"""
    
    bill_to_address = serializers.CharField()
    bill_to_gstin = serializers.CharField(allow_blank=True)
    bill_to_contact = serializers.CharField(allow_blank=True)
    bill_to_state = serializers.CharField(allow_blank=True)
    bill_to_country = serializers.CharField()
    ship_to_address = serializers.CharField()
    ship_to_state = serializers.CharField(allow_blank=True)
    ship_to_country = serializers.CharField()


class TaxTypeDeterminationSerializer(serializers.Serializer):
    """Serializer for tax type determination request"""
    
    user_state = serializers.CharField()
    bill_to_state = serializers.CharField()
    bill_to_country = serializers.CharField()


class FileUploadSerializer(serializers.Serializer):
    """Serializer for file upload"""
    
    file = serializers.FileField()
    voucher_id = serializers.IntegerField(required=False, allow_null=True)
    
    def validate_file(self, value):
        """Validate file type and size"""
        from accounting.sales_flow import validate_file_upload
        
        # Validate file
        try:
            is_valid, file_type = validate_file_upload(value.name, value.size)
        except Exception as e:
            raise serializers.ValidationError(str(e))
        
        return value
