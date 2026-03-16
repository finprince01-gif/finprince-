from rest_framework import serializers  # type: ignore[import]
from .models_voucher_receipt import VoucherReceiptSingle, VoucherReceiptBulk  # type: ignore[import]
from .models import MasterLedger  # type: ignore[import]


class VoucherReceiptSingleSerializer(serializers.ModelSerializer):
    # Read-only name fields for GET responses
    receive_in_name = serializers.CharField(source='receive_in.name', read_only=True)
    receive_from_name = serializers.CharField(source='receive_from.name', read_only=True)

    # Allow both ID and Name in POST/PUT
    receive_in = serializers.CharField(required=False, allow_null=True)
    receive_from = serializers.CharField(required=False, allow_null=True)

    class Meta:
        model = VoucherReceiptSingle
        fields = '__all__'
        read_only_fields = ['tenant_id']

    def _resolve_ledger(self, value, tenant_id=None):
        """
        Resolve either a numeric ID or a ledger name to a MasterLedger instance.
        Returns the MasterLedger instance, or None if not found.
        """
        if value is None or value == '':
            return None

        # Already an integer ID (most common — sent by the form UI)
        try:
            pk = int(value)
            qs = MasterLedger.objects.filter(pk=pk)
            if tenant_id:
                qs = qs.filter(tenant_id=tenant_id)
            return qs.first()
        except (ValueError, TypeError):
            pass

        # String name (sent by prefill / bank reconciliation flow)
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

        receive_in_val = attrs.get('receive_in')
        receive_from_val = attrs.get('receive_from')

        if receive_in_val is not None and not hasattr(receive_in_val, 'pk'):
            # raw value (int or string) – needs resolving
            attrs['receive_in'] = self._resolve_ledger(receive_in_val, tenant_id)

        if receive_from_val is not None and not hasattr(receive_from_val, 'pk'):
            attrs['receive_from'] = self._resolve_ledger(receive_from_val, tenant_id)

        return attrs


class VoucherReceiptBulkSerializer(serializers.ModelSerializer):
    receive_in_name = serializers.CharField(source='receive_in.name', read_only=True)
    receive_in = serializers.CharField(required=False, allow_null=True)

    class Meta:
        model = VoucherReceiptBulk
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

        receive_in_val = attrs.get('receive_in')
        if receive_in_val is not None and not hasattr(receive_in_val, 'pk'):
            attrs['receive_in'] = self._resolve_ledger(receive_in_val, tenant_id)

        return attrs
