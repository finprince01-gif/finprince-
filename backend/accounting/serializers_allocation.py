from rest_framework import serializers
from .models import TransactionAllocation, MasterLedger
from .utils_serializers import SafeModelSerializerMixin

class VoucherAllocationSerializer(SafeModelSerializerMixin, serializers.ModelSerializer):
    """
    Serializer for Voucher/Transaction Allocation.
    Maps to the TransactionAllocation model (aliased as VoucherAllocation).
    """
    customer_name = serializers.CharField(source='pay_from_ledger.name', read_only=True)
    ledger_name = serializers.CharField(source='pay_from_ledger.name', read_only=True)
    
    class Meta:
        model = TransactionAllocation
        fields = [
            'id', 'tenant_id', 'transaction', 'type', 'reference_id', 
            'reference_number', 'reference_type', 'allocated_amount', 
            'amount', 'is_advance', 'advance_ref_no', 'due_date', 
            'due_status', 'original_amount', 'invoice_date', 
            'pending_before', 'balance_after', 'ledger_id_val', 
            'party_customer_id', 'party_vendor_id', 'customer_name', 
            'ledger_name'
        ]
        read_only_fields = ['id', 'tenant_id']
