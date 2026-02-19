from rest_framework import serializers
from .models_voucher_expense import VoucherExpense
import uuid

class VoucherExpenseSerializer(serializers.ModelSerializer):
    voucher_number = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = VoucherExpense
        fields = '__all__'
        read_only_fields = ['tenant_id']
    
    def create(self, validated_data):
        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"EXP-{uuid.uuid4().hex[:6].upper()}"
        return super().create(validated_data)
