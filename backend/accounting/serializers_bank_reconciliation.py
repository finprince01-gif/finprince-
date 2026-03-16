from rest_framework import serializers  # type: ignore[import]
from .models_bank_reconciliation import BankStatementTransaction, BankReconciliationLink  # type: ignore[import]


class BankStatementTransactionSerializer(serializers.ModelSerializer):
    debit = serializers.DecimalField(
        source='debit_amount', max_digits=15, decimal_places=2, read_only=True
    )
    credit = serializers.DecimalField(
        source='credit_amount', max_digits=15, decimal_places=2, read_only=True
    )
    match_status = serializers.CharField(source='status', read_only=True)
    narration = serializers.CharField(source='description', read_only=True)
    extracted_party = serializers.CharField(source='suggested_party', read_only=True)
    extracted_invoice = serializers.CharField(source='suggested_invoice', read_only=True)

    matched_voucher_number = serializers.SerializerMethodField()

    class Meta:
        model = BankStatementTransaction
        fields = [
            'id', 'bank_ledger_id', 'transaction_date', 'description', 'narration',
            'debit_amount', 'credit_amount', 'debit', 'credit',
            'reference_number', 'cheque_number', 'running_balance',
            'status', 'match_status', 'matched_voucher_id', 'matched_voucher_number',
            'suggested_party', 'extracted_party', 'suggested_invoice', 'extracted_invoice',
            'suggested_voucher_type', 'confidence_score', 'multi_voucher_ids',
            'is_ignored', 'reconciled_at', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_matched_voucher_number(self, obj):
        if not obj.matched_voucher_id:
            return None
        
        # Check Payment Single
        from .models_voucher_payment import VoucherPaymentSingle # type: ignore
        vp = VoucherPaymentSingle.objects.filter(id=obj.matched_voucher_id).first()
        if vp:
            return vp.voucher_number
            
        # Check Receipt Single
        from .models_voucher_receipt import VoucherReceiptSingle # type: ignore
        vr = VoucherReceiptSingle.objects.filter(id=obj.matched_voucher_id).first()
        if vr:
            return vr.voucher_number

        # Check legacy Voucher (if any)
        from .models import Voucher # type: ignore
        v = Voucher.objects.filter(id=obj.matched_voucher_id).first()
        if v:
            return v.voucher_number
            
        return None


class BankReconciliationLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankReconciliationLink
        fields = [
            'id', 'bank_transaction_id', 'voucher_id', 'voucher_type',
            'reconciliation_date', 'reconciliation_status',
            'reconciliation_type', 'confidence_score', 'match_method',
            'cheque_number', 'reconciled_at', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']
