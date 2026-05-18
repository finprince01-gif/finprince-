"""
Sales Voucher Serializers
Handles serialization/deserialization of sales voucher data.
"""

from rest_framework import serializers
from accounting.models import (
    SalesVoucher,
    SalesVoucherItem,
    MasterLedger
)
from masters.voucher_master_models import MasterVoucherReceipts as ReceiptVoucherType
from masters.voucher_master_models import MasterVoucherSales as VoucherConfiguration
from .serializers_voucher_sales import VoucherSalesPaymentDetailsSerializer


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
    
    # Map model fields to serializer fields expected by frontend if needed
    # Or just expose model fields directly
    
    taxable_amount = serializers.DecimalField(source='taxable_value', max_digits=18, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(source='invoice_value', max_digits=18, decimal_places=2, read_only=True)
    
    # Aliases
    unit = serializers.CharField(source='uom', read_only=True)
    hsn_code = serializers.CharField(source='hsn_sac', read_only=True)
    rate = serializers.DecimalField(source='item_rate', max_digits=18, decimal_places=2, read_only=True)
    quantity = serializers.DecimalField(source='qty', max_digits=18, decimal_places=4, read_only=True)
    
    # Tax fields mapping
    cgst_amount = serializers.DecimalField(source='cgst', max_digits=18, decimal_places=2, read_only=True)
    sgst_amount = serializers.DecimalField(source='sgst', max_digits=18, decimal_places=2, read_only=True)
    igst_amount = serializers.DecimalField(source='igst', max_digits=18, decimal_places=2, read_only=True)

    class Meta:
        model = SalesVoucherItem
        fields = [
            'id', 'item_name', 'hsn_code', 'quantity', 'unit', 'rate',
            'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_amount', 
            # 'line_number' # missing in model?
        ]
        read_only_fields = ['id', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_amount']


class SalesVoucherDocumentSerializer(serializers.Serializer):
    """Serializer stub for Sales Voucher Documents (Stored as field in header)"""
    id = serializers.IntegerField(default=0)
    file_name = serializers.CharField()
    file_path = serializers.CharField()
    file_type = serializers.CharField()
    file_size = serializers.IntegerField()
    uploaded_at = serializers.DateTimeField(allow_null=True, required=False)



class SalesVoucherListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for Sales Voucher list/dropdowns"""
    
    # Aliases for frontend compatibility
    voucher_no = serializers.CharField(source='sales_invoice_no', read_only=True)
    sales_invoice_number = serializers.CharField(source='sales_invoice_no', read_only=True)
    voucher_type_name = serializers.CharField(source='voucher_name', read_only=True)
    
    # Map grand_total to total_amount for frontend
    total_amount = serializers.FloatField(source='payment_details.payment_invoice_value', default=0.0, read_only=True)
    grand_total = serializers.FloatField(source='payment_details.payment_invoice_value', default=0.0, read_only=True)
    taxable_value = serializers.FloatField(source='payment_details.payment_taxable_value', default=0.0, read_only=True)
    tcs_amount = serializers.FloatField(source='payment_details.payment_tds_income_tax', default=0.0, read_only=True)
    balance_amount = serializers.FloatField(source='payment_details.payment_balance', default=0.0, read_only=True)
    status = serializers.CharField(default='draft', read_only=True)

    class Meta:
        model = SalesVoucher
        fields = [
            'id', 'date', 'voucher_no', 'sales_invoice_number', 'customer_name', 
            'voucher_type_name', 'total_amount', 'grand_total', 'taxable_value', 'tcs_amount', 'balance_amount', 'status'
        ]
        read_only_fields = fields


class SalesVoucherSerializer(serializers.ModelSerializer):
    """Serializer for Sales Voucher"""
    
    items = SalesVoucherItemSerializer(many=True, read_only=True)
    # documents = SalesVoucherDocumentSerializer(many=True, read_only=True) # Commented out as table doesn't exist
    
    sales_invoice_number = serializers.CharField(source='sales_invoice_no', read_only=True)
    voucher_type_name = serializers.CharField(source='voucher_name', read_only=True)
    
    # Address mapping
    bill_to_address = serializers.CharField(source='bill_to', read_only=True)
    # bill_to_state/country etc not in header schema either...
    
    ship_to_address = serializers.CharField(source='ship_to', read_only=True)
    
    # Missing fields mocking
    payment_details = VoucherSalesPaymentDetailsSerializer(read_only=True)
    grand_total = serializers.FloatField(source='payment_details.payment_invoice_value', default=0.0, read_only=True)
    status = serializers.CharField(default='draft', read_only=True)
    current_step = serializers.IntegerField(default=1, read_only=True)
    
    class Meta:
        model = SalesVoucher
        fields = [
            'id', 'date', 'voucher_type_name', 'sales_invoice_number',
            'customer_name', 'bill_to_address', 
            # 'bill_to_gstin', 'bill_to_contact', # These exist in schema? Yes
            'gstin', 'contact', # Expose model fields directly
            
            # 'bill_to_state', 'bill_to_country', 'ship_to_state', 'ship_to_country', # Missing
            
            'ship_to_address',
            'tax_type', 
            # GST-Compliant Fields
            'place_of_supply', 'reverse_charge', 'invoice_type', 'export_type',
            'port_code', 'shipping_bill_number', 'shipping_bill_date', 'ecommerce_gstin',
            # Status and Totals
            'status', 'current_step', 
            # 'total_taxable_amount', 'total_cgst', ... # Missing
            'grand_total', 
            'payment_details', 
            'items', 
            # 'documents', 
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'sales_invoice_number', 'tax_type', 'grand_total', 'created_at', 'updated_at'
        ]


class SalesVoucherCreateSerializer(serializers.Serializer):
    """Serializer for creating a new sales voucher"""
    
    date = serializers.DateField()
    voucher_type_id = serializers.IntegerField()
    customer_id = serializers.IntegerField()
    ship_to_address = serializers.CharField(required=False, allow_blank=True)
    customer_branch = serializers.CharField(required=False, allow_blank=True, allow_null=True)
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
        return value
