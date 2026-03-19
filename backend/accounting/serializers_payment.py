from rest_framework import serializers  # type: ignore[import]
from .models_voucher_payment import VoucherPaymentSingle, VoucherPaymentBulk  # type: ignore[import]
from .models import MasterLedger, Voucher  # type: ignore[import]
from decimal import Decimal, InvalidOperation


def _safe_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")

class VoucherPaymentSingleSerializer(serializers.ModelSerializer):
    pay_from_name = serializers.CharField(source='pay_from.name', read_only=True)
    pay_to_name = serializers.CharField(source='pay_to.name', read_only=True)
    
    pay_from = serializers.CharField(required=False, allow_null=True)
    pay_to = serializers.CharField(required=False, allow_null=True)
    
    class Meta:
        model = VoucherPaymentSingle
        fields = '__all__'
        read_only_fields = ['tenant_id']

    def _resolve_ledger(self, value, tenant_id=None):
        """
        Resolve either a numeric ID or a ledger name to a MasterLedger instance.
        """
        if value is None or value == '':
            return None

        # Already an integer ID
        try:
            pk = int(value)
            qs = MasterLedger.objects.filter(pk=pk)
            if tenant_id:
                qs = qs.filter(tenant_id=tenant_id)
            return qs.first()
        except (ValueError, TypeError):
            pass

        # String name
        if isinstance(value, str):
            qs = MasterLedger.objects.filter(name__iexact=value.strip())
            if tenant_id:
                qs = qs.filter(tenant_id=tenant_id)
            return qs.first()

        return None

    def validate(self, attrs):
        request = self.context.get('request')
        tenant_id = None
        if request and hasattr(request.user, 'tenant_id'):
            tenant_id = request.user.tenant_id

        pay_from_val = attrs.get('pay_from')
        pay_to_val = attrs.get('pay_to')

        if pay_from_val is not None and not hasattr(pay_from_val, 'pk'):
            attrs['pay_from'] = self._resolve_ledger(pay_from_val, tenant_id)

        if pay_to_val is not None and not hasattr(pay_to_val, 'pk'):
            attrs['pay_to'] = self._resolve_ledger(pay_to_val, tenant_id)

        return attrs

    def create(self, validated_data):
        payment = super().create(validated_data)

        voucher = Voucher.objects.create(
            tenant_id=payment.tenant_id,
            type='payment',
            date=payment.date,
            voucher_number=payment.voucher_number,
            party=payment.pay_to.name if payment.pay_to else None,
            account=payment.pay_from.name if payment.pay_from else None,
            amount=payment.total_payment,
            total=payment.total_payment,
            source=payment.source or 'manual',
            reference_id=payment.id,
        )

        setattr(payment, '_accounting_voucher_id', voucher.id)
        if any(field.name == 'voucher_id' for field in payment._meta.fields):
            payment.voucher_id = voucher.id
            payment.save(update_fields=['voucher_id'])

        return payment

class VoucherPaymentBulkSerializer(serializers.ModelSerializer):
    pay_from_name = serializers.CharField(source='pay_from.name', read_only=True)
    pay_from = serializers.CharField(required=False, allow_null=True)

    class Meta:
        model = VoucherPaymentBulk
        fields = '__all__'
        read_only_fields = ['tenant_id']

    def _resolve_ledger(self, value, tenant_id=None):
        if value is None or value == '':
            return None
        try:
            pk = int(value)
            qs = MasterLedger.objects.filter(pk=pk)
            if tenant_id:
                qs = qs.filter(tenant_id=tenant_id)
            return qs.first()
        except (ValueError, TypeError):
            pass
        if isinstance(value, str):
            qs = MasterLedger.objects.filter(name__iexact=value.strip())
            if tenant_id:
                qs = qs.filter(tenant_id=tenant_id)
            return qs.first()
        return None

    def validate(self, attrs):
        request = self.context.get('request')
        tenant_id = None
        if request and hasattr(request.user, 'tenant_id'):
            tenant_id = request.user.tenant_id

        pay_from_val = attrs.get('pay_from')
        if pay_from_val is not None and not hasattr(pay_from_val, 'pk'):
            attrs['pay_from'] = self._resolve_ledger(pay_from_val, tenant_id)

        return attrs

    def create(self, validated_data):
        payment = super().create(validated_data)

        payment_rows = payment.payment_rows if isinstance(payment.payment_rows, list) else []
        total_amount = sum(
            (_safe_decimal(row.get('amount')) for row in payment_rows if isinstance(row, dict)),
            Decimal("0"),
        )

        voucher = Voucher.objects.create(
            tenant_id=payment.tenant_id,
            type='payment',
            date=payment.date,
            voucher_number=payment.voucher_number,
            account=payment.pay_from.name if payment.pay_from else None,
            amount=total_amount,
            total=total_amount,
            narration=payment.posting_note,
            source='manual',
            items_data=payment_rows or None,
            reference_id=payment.id,
        )

        setattr(payment, '_accounting_voucher_id', voucher.id)
        if any(field.name == 'voucher_id' for field in payment._meta.fields):
            payment.voucher_id = voucher.id
            payment.save(update_fields=['voucher_id'])

        return payment
