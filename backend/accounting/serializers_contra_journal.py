from rest_framework import serializers
from .models_voucher_contra import VoucherContra
from .models_voucher_journal import VoucherJournal
from core.tenant import get_tenant_from_request
import uuid

class VoucherContraSerializer(serializers.ModelSerializer):
    # Map frontend camelCase to backend snake_case
    fromAccount = serializers.CharField(source='from_account')
    toAccount = serializers.CharField(source='to_account')
    voucher_number = serializers.CharField(required=False)

    class Meta:
        model = VoucherContra
        # Include mapped fields and other model fields
        fields = ['id', 'date', 'voucher_number', 'fromAccount', 'toAccount', 'amount', 'narration', 'tenant_id']
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        request = self.context.get('request')
        validated_data['tenant_id'] = get_tenant_from_request(request)
        
        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"CN-{uuid.uuid4().hex[:6].upper()}"
            
        return super().create(validated_data)

class VoucherJournalSerializer(serializers.ModelSerializer):
    # Map frontend camelCase to backend snake_case
    totalDebit = serializers.DecimalField(source='total_debit', max_digits=15, decimal_places=2)
    totalCredit = serializers.DecimalField(source='total_credit', max_digits=15, decimal_places=2)
    voucher_number = serializers.CharField(required=False)

    class Meta:
        model = VoucherJournal
        fields = ['id', 'date', 'voucher_number', 'entries', 'totalDebit', 'totalCredit', 'narration', 'tenant_id']
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']

    def create(self, validated_data):
        request = self.context.get('request')
        validated_data['tenant_id'] = get_tenant_from_request(request)
        
        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"JN-{uuid.uuid4().hex[:6].upper()}"

        return super().create(validated_data)
