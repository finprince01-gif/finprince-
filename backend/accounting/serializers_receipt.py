from rest_framework import serializers
from .models_voucher_receipt import VoucherReceiptSingle, VoucherReceiptBulk

class VoucherReceiptSingleSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherReceiptSingle
        fields = '__all__'
        read_only_fields = ['tenant_id']

class VoucherReceiptBulkSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherReceiptBulk
        fields = '__all__'
        read_only_fields = ['tenant_id']
