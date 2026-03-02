from rest_framework import serializers
from .models_voucher_payment import VoucherPaymentSingle, VoucherPaymentBulk

class VoucherPaymentSingleSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherPaymentSingle
        fields = '__all__'
        read_only_fields = ['tenant_id']

class VoucherPaymentBulkSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherPaymentBulk
        fields = '__all__'
        read_only_fields = ['tenant_id']
