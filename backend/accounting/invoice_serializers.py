"""
Sales Invoice Serializers
Handles data transformation for sales invoices.
"""

from rest_framework import serializers
from accounting.models import SalesInvoice, MasterLedger
from masters.voucher_master_models import MasterVoucherReceipts as ReceiptVoucherType
from core.utils import TenantModelSerializerMixin


class SalesInvoiceSerializer(TenantModelSerializerMixin, serializers.ModelSerializer):
    """Serializer for Sales Invoice - Invoice Details"""
    
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    voucher_type_name = serializers.CharField(source='voucher_type.name', read_only=True)
    
    class Meta:
        model = SalesInvoice
        fields = [
            'id',
            'invoice_number',
            'invoice_date',
            'voucher_type',
            'voucher_type_name',
            'customer',
            'customer_name',
            'bill_to_address',
            'bill_to_gstin',
            'bill_to_contact',
            'bill_to_state',
            'bill_to_country',
            'ship_to_address',
            'ship_to_state',
            'ship_to_country',
            'tax_type',
            'status',
            'current_step',
            'tenant_id',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'invoice_number',
            'tax_type',
            'tenant_id',
            'created_at',
            'updated_at',
        ]


class SalesInvoiceListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing invoices"""
    
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    
    class Meta:
        model = SalesInvoice
        fields = [
            'id',
            'invoice_number',
            'invoice_date',
            'customer_name',
            'tax_type',
            'status',
        ]
