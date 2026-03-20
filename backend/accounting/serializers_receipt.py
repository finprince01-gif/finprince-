import uuid
from rest_framework import serializers  # type: ignore[import]
from .models_voucher_receipt import VoucherReceiptSingle, VoucherReceiptBulk  # type: ignore[import]
from .models import MasterLedger, Voucher, JournalEntry  # type: ignore[import]
from accounting.services.ledger_service import post_transaction, _resolve_ledger
from customerportal.database import CustomerMasterCustomerBasicDetails
from vendors.models import VendorMasterBasicDetail
from decimal import Decimal, InvalidOperation


def _safe_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


class VoucherReceiptSingleSerializer(serializers.ModelSerializer):
    # Read-only name fields for GET responses
    receive_in_name = serializers.CharField(source='receive_in.name', read_only=True)
    receive_from_name = serializers.CharField(source='receive_from.name', read_only=True)

    # Allow both ID and Name in POST/PUT
    receive_in = serializers.CharField(required=False, allow_null=True)
    receive_from = serializers.CharField(required=False, allow_null=True)
    voucher_number = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = VoucherReceiptSingle
        fields = '__all__'
        read_only_fields = ['tenant_id']

    def validate(self, attrs):
        request = self.context.get('request')
        tenant_id = None
        if request and hasattr(request.user, 'tenant_id'):
            tenant_id = request.user.tenant_id

        # Resolve accounts automatically (can be ID or Name)
        receive_in_val = attrs.get('receive_in')
        receive_from_val = attrs.get('receive_from')

        if receive_in_val is not None and not hasattr(receive_in_val, 'pk'):
            attrs['receive_in'] = _resolve_ledger(receive_in_val, tenant_id)

        if receive_from_val is not None and not hasattr(receive_from_val, 'pk'):
            attrs['receive_from'] = _resolve_ledger(receive_from_val, tenant_id)

        return attrs

    def create(self, validated_data):
        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"REC-{uuid.uuid4().hex[:6].upper()}"
            
        receipt = super().create(validated_data)

        # Unified voucher - Check existence first to avoid transaction poisoning
        voucher = Voucher.objects.filter(
            tenant_id=receipt.tenant_id, 
            type='receipt', 
            voucher_number=receipt.voucher_number
        ).first()

        if not voucher:
            try:
                voucher = Voucher.objects.create(
                    tenant_id=receipt.tenant_id,
                    type='receipt',
                    date=receipt.date,
                    voucher_number=receipt.voucher_number,
                    party=receipt.receive_from.name if receipt.receive_from else None,
                    account=receipt.receive_in.name if receipt.receive_in else None,
                    amount=receipt.total_receipt,
                    total=receipt.total_receipt,
                    source=receipt.source or 'manual',
                    reference_id=receipt.id,
                )
            except Exception as e:
                print(f"!!! VOUCHER CREATION FAILED in receipt serializer: {str(e)}")
                pass

        if voucher:
            setattr(receipt, '_accounting_voucher_id', voucher.id)
            if any(field.name == 'voucher_id' for field in receipt._meta.fields):
                receipt.voucher_id = voucher.id
                receipt.save(update_fields=['voucher_id'])

        # --- Double-Entry Posting for Single Receipt (entries table) ---
        try:
            total_decimal = _safe_decimal(receipt.total_receipt)
            if total_decimal > 0 and voucher:
                entries = []
                # Debit: destination account (receive_in)
                if receipt.receive_in:
                    entries.append({"ledger_id": receipt.receive_in.id, "debit": float(total_decimal), "credit": 0})
                
                # Credit: source (receive_from)
                if receipt.receive_from:
                    entries.append({"ledger_id": receipt.receive_from.id, "debit": 0, "credit": float(total_decimal)})
                
                if len(entries) == 2:
                    post_transaction(voucher_type="RECEIPT", voucher_id=voucher.id, tenant_id=receipt.tenant_id, entries=entries)
        except Exception as e:
            print(f"Error posting single receipt to entries: {str(e)}")

        return receipt


class VoucherReceiptBulkSerializer(serializers.ModelSerializer):
    receive_in_name = serializers.CharField(source='receive_in.name', read_only=True)
    receive_in = serializers.CharField(required=False, allow_null=True)
    voucher_number = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = VoucherReceiptBulk
        fields = '__all__'
        read_only_fields = ['tenant_id']

    def validate(self, attrs):
        request = self.context.get('request')
        tenant_id = None
        if request and hasattr(request.user, 'tenant_id'):
            tenant_id = request.user.tenant_id

        # Resolve accounts automatically (can be ID or Name)
        receive_in_val = attrs.get('receive_in')
        if receive_in_val is not None and not hasattr(receive_in_val, 'pk'):
            attrs['receive_in'] = _resolve_ledger(receive_in_val, tenant_id)

        return attrs

    def create(self, validated_data):
        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"RECB-{uuid.uuid4().hex[:6].upper()}"
            
        receipt = super().create(validated_data)

        # Unified voucher
        rows = receipt.receipt_rows if isinstance(receipt.receipt_rows, list) else []
        total_amount = sum(
            (_safe_decimal(row.get('amount')) for row in rows if isinstance(row, dict)),
            Decimal("0"),
        )
        
        voucher = Voucher.objects.filter(
            tenant_id=receipt.tenant_id, 
            type='receipt', 
            voucher_number=receipt.voucher_number
        ).first()

        if not voucher:
            try:
                voucher = Voucher.objects.create(
                    tenant_id=receipt.tenant_id,
                    type='receipt',
                    date=receipt.date,
                    voucher_number=receipt.voucher_number,
                    account=receipt.receive_in.name if receipt.receive_in else None,
                    amount=total_amount,
                    total=total_amount,
                    narration=receipt.posting_note,
                    source='manual',
                    items_data=rows or None,
                    reference_id=receipt.id,
                )
            except Exception as e:
                print(f"!!! VOUCHER CREATION FAILED in bulk receipt: {str(e)}")
                pass

        if voucher:
            setattr(receipt, '_accounting_voucher_id', voucher.id)
            if any(field.name == 'voucher_id' for field in receipt._meta.fields):
                receipt.voucher_id = voucher.id
                receipt.save(update_fields=['voucher_id'])

        # --- Double-Entry Posting for Bulk Receipt (entries table) ---
        try:
            if voucher:
                entries = []
                total_bulk_decimal = Decimal("0")
                rows = receipt.receipt_rows if isinstance(receipt.receipt_rows, list) else []
                
                for row in rows:
                    amt_dec = _safe_decimal(row.get('amount', 0))
                    receive_from_id = row.get('receiveFrom') # Ledger ID or name? UI usually sends ID.
                    if amt_dec > 0 and receive_from_id:
                        total_bulk_decimal += amt_dec
                        entries.append({"ledger_id": receive_from_id, "debit": 0, "credit": float(amt_dec)})
                
                if total_bulk_decimal > 0 and receipt.receive_in:
                    # Debit Destination account
                    entries.append({"ledger_id": receipt.receive_in.id, "debit": float(total_bulk_decimal), "credit": 0})
                    
                    if len(entries) >= 2:
                        post_transaction(voucher_type="RECEIPT_BULK", voucher_id=voucher.id, tenant_id=receipt.tenant_id, entries=entries)
        except Exception as e:
            print(f"Error posting bulk receipt to entries: {str(e)}")

        return receipt
