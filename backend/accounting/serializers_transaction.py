"""
Transaction File Serializer
Handles serialization for the comprehensive ledger master table.
"""

from rest_framework import serializers
from .models_transaction import TransactionFile


class TransactionFileSerializer(serializers.ModelSerializer):
    """
    Serializer for TransactionFile model.
    Provides comprehensive ledger data with balance tracking.
    """

    
    # Computed field for display balance
    display_balance = serializers.SerializerMethodField()
    
    class Meta:
        model = TransactionFile
        fields = [
            'id', 'tenant_id',
            # Core Fields
            'financial_year_id', 'ledger_code', 'ledger_name', 'alias_name',
            'group_id', 'nature', 'ledger_type', 'is_active',
            # Balance Fields
            'opening_balance', 'opening_balance_type',
            'current_balance', 'current_balance_type',
            'closing_balance', 'closing_balance_type',
            'display_balance',  # Computed field
            # Bank Details
            'bank_name', 'branch_name', 'account_number',
            'ifsc_code', 'micr_code', 'upi_id',
            # GST Details
            'gst_applicable', 'gst_registration_type', 'gstin',
            'hsn_sac_code', 'gst_rate', 'cgst_rate', 'sgst_rate', 'igst_rate',
            # TDS Details
            'is_tds_applicable', 'tds_section', 'tds_rate',
            # Contact Details
            'contact_person', 'mobile', 'email',
            'address_line1', 'address_line2', 'city', 'state', 'pincode', 'country',
            # Business Rules
            'allow_bill_wise', 'credit_limit', 'credit_days',
            'is_cost_center_required', 'is_inventory_linked',
            'is_system_ledger', 'lock_editing',
            # Audit
            'created_by', 'updated_by',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'tenant_id', 'display_balance', 'created_at', 'updated_at']
    
    def get_display_balance(self, obj):
        """Get properly signed balance for display."""
        return float(obj.get_display_balance())
    
    def create(self, validated_data):
        """Create new transaction file entry."""
        # Set opening balance as current balance if not provided
        if 'current_balance' not in validated_data and 'opening_balance' in validated_data:
            validated_data['current_balance'] = validated_data['opening_balance']
            validated_data['current_balance_type'] = validated_data.get('opening_balance_type', 'Dr')
        
        return super().create(validated_data)


class TransactionFileSummarySerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing transaction files.
    Only includes essential fields for performance.
    """
    
    display_balance = serializers.SerializerMethodField()
    
    class Meta:
        model = TransactionFile
        fields = [
            'id', 'ledger_code', 'ledger_name', 'alias_name',
            'nature', 'ledger_type', 'is_active',
            'current_balance', 'current_balance_type', 'display_balance'
        ]
    
    def get_display_balance(self, obj):
        """Get properly signed balance for display."""
        return float(obj.get_display_balance())
