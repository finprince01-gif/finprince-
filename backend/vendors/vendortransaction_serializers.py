"""
Serializers for Vendor Transactions.
"""
from rest_framework import serializers
from .models import VendorTransaction


class VendorTransactionSerializer(serializers.ModelSerializer):
    """
    Serializer for VendorTransaction model.
    Handles all fields for transaction display in Vendor Portal.
    """
    class Meta:
        model = VendorTransaction
        fields = [
            'id',
            'tenant_id',
            'vendor_id',
            'transaction_type',
            'transaction_number',
            'transaction_date',
            'amount',
            'tax_amount',
            'total_amount',
            'status',
            'payment_mode',
            'reference_number',
            'reference_type',
            'is_advance',
            'notes',
            'ledger_name',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
