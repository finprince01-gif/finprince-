import uuid
from rest_framework import serializers  # type: ignore[import]
from .models_voucher_payment import PaymentVoucher, PaymentVoucherItem  # type: ignore[import]
from .models import MasterLedger, Voucher, JournalEntry  # type: ignore[import]
from accounting.services.ledger_service import post_transaction, _resolve_ledger
from decimal import Decimal, InvalidOperation


def _safe_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


# ---------------------------------------------------------------------------
# Item serializer
# ---------------------------------------------------------------------------

class PaymentVoucherItemSerializer(serializers.ModelSerializer):
    # Incoming fields for resolving ledger
    type = serializers.CharField(write_only=True, required=False)
    id_ref = serializers.IntegerField(write_only=True, required=False)
    advance_ref_no = serializers.CharField(write_only=True, required=False, allow_null=True)
    
    # Read-only display fields
    pay_to_ledger_name = serializers.CharField(source='pay_to_ledger.name', read_only=True)
    vendor_name = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = PaymentVoucherItem
        fields = [
            'id', 'amount', 'reference_type', 'reference_id', 
            'transaction_details', 'pay_to_ledger', 'pay_to_ledger_name',
            'type', 'id_ref', 'vendor_name', 'customer_name',
            'advance_ref_no'
        ]
        extra_kwargs = {
            'pay_to_ledger': {'required': False, 'allow_null': True},
            'reference_type': {'required': False},
            'advance_ref_no': {'write_only': True, 'required': False}
        }

    def get_vendor_name(self, obj):
        from vendors.models import VendorMasterBasicDetail as Vendor
        v = Vendor.objects.filter(ledger_id=obj.pay_to_ledger_id).first()
        return v.vendor_name if v else None

    def get_customer_name(self, obj):
        from customerportal.database import CustomerMasterCustomerBasicDetails as Customer
        c = Customer.objects.filter(ledger_id=obj.pay_to_ledger_id).first()
        return c.customer_name if c else None

    def validate(self, attrs):
        type_str = attrs.pop('type', None)
        id_ref = attrs.pop('id_ref', None)
        
        if type_str and id_ref:
            ledger_id = None
            if type_str == 'vendor':
                from vendors.models import VendorMasterBasicDetail as Vendor
                v = Vendor.objects.filter(pk=id_ref).first()
                if v: ledger_id = v.ledger_id
            elif type_str == 'customer':
                from customerportal.database import CustomerMasterCustomerBasicDetails as Customer
                c = Customer.objects.filter(pk=id_ref).first()
                if c: ledger_id = c.ledger_id
            elif type_str == 'ledger':
                ledger_id = id_ref
                
            if ledger_id:
                try:
                    attrs['pay_to_ledger'] = MasterLedger.objects.get(pk=ledger_id)
                except MasterLedger.DoesNotExist:
                    raise serializers.ValidationError({"id_ref": f"Resolved Ledger ID {ledger_id} not found."})
            else:
                raise serializers.ValidationError({"id_ref": f"Could not resolve {type_str} with ID {id_ref} to a ledger."})
        
        if not attrs.get('pay_to_ledger'):
            raise serializers.ValidationError({"pay_to_ledger": "Pay To Ledger is required."})

        return attrs


# ---------------------------------------------------------------------------
# Master serializer
# ---------------------------------------------------------------------------

class PaymentVoucherSerializer(serializers.ModelSerializer):
    items = PaymentVoucherItemSerializer(many=True, required=False)  # type: ignore
    pay_from_name = serializers.CharField(source='pay_from.name', read_only=True)
    pay_from = serializers.CharField(required=False, allow_null=True)
    voucher_number = serializers.CharField(required=False, allow_blank=True)
    narration = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    
    # Optional Top-Level Advance (for backward compatibility / bulk)
    advance_ref_no = serializers.CharField(required=False, allow_null=True, allow_blank=True, write_only=True)
    advance_amount = serializers.DecimalField(max_digits=15, decimal_places=2, required=False, write_only=True)
    total_payment = serializers.SerializerMethodField()

    class Meta:
        model = PaymentVoucher
        fields = [
            'id', 'date', 'voucher_type', 'voucher_number', 'pay_from', 
            'pay_from_name', 'narration', 'total_amount', 'total_payment', 'items',
            'advance_ref_no', 'advance_amount',
            'bank_reconciled', 'bank_reconcile_date', 'bank_statement_id', 'bank_reference_number'
        ]
        read_only_fields = ['tenant_id']

    def get_total_payment(self, obj):
        return obj.total_amount

    def validate(self, attrs):
        request = self.context.get('request')
        tenant_id = getattr(getattr(request, 'user', None), 'tenant_id', None)

        pay_from_val = attrs.get('pay_from')
        if pay_from_val is not None and not hasattr(pay_from_val, 'pk'):
            attrs['pay_from'] = _resolve_ledger(pay_from_val, tenant_id)

        return attrs

    # ------------------------------------------------------------------
    # CREATE
    # ------------------------------------------------------------------
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        
        # Pull top-level advance if present
        top_adv_ref = validated_data.pop('advance_ref_no', None)
        top_adv_amt = _safe_decimal(validated_data.pop('advance_amount', 0))

        # Auto voucher number
        if not validated_data.get('voucher_number'):
            # hex is a property returning a string, manually slice to appease linter
            uid_str = str(uuid.uuid4().hex)
            short_id = uid_str[0:6].upper()  # type: ignore
            validated_data['voucher_number'] = f"PAY-{short_id}"

        # Compute total from items + top advance
        total = sum(_safe_decimal(i.get('amount', 0)) for i in items_data)
        total += top_adv_amt
        
        if total == 0 and 'total_amount' in validated_data:
            total = validated_data.get('total_amount')
        
        validated_data['total_amount'] = total

        voucher = PaymentVoucher.objects.create(**validated_data)

        # Create child items (Strictly one row per logic)
        for item_data in items_data:
            pay_to_ledger = item_data.pop('pay_to_ledger')
            
            # Simple, direct row creation. 
            # If an advance was requested, it should already be a separate item
            # or we create it as one here based on reference_type.
            
            # CRITICAL FIELD VALIDATION (as per Step 5)
            # - pay_to_ledger MUST NOT be NULL
            # - reference_type MUST = 'ADVANCE' if it's an advance
            # - amount > 0
            
            if pay_to_ledger and _safe_decimal(item_data.get('amount', 0)) > 0:
                # If it's an advance, we store advance_ref_no in transaction_details
                txn_details = item_data.get('transaction_details', {})
                adv_ref = item_data.pop('advance_ref_no', None)
                if adv_ref:
                    if not txn_details: txn_details = {}
                    txn_details['reference_no'] = adv_ref

                PaymentVoucherItem.objects.create(
                    voucher=voucher, 
                    pay_to_ledger=pay_to_ledger, 
                    amount=item_data.get('amount'),
                    reference_type=item_data.get('reference_type', 'INVOICE'),
                    reference_id=item_data.get('reference_id'),
                    transaction_details=txn_details
                )

        self._post_to_global_voucher(voucher)
        return voucher

    # ------------------------------------------------------------------
    # UPDATE (partial supported)
    # ------------------------------------------------------------------
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        instance = super().update(instance, validated_data)

        if items_data is not None:
            # Replace child items wholesale
            instance.items.all().delete()
            total = Decimal("0")
            for item_data in items_data:
                pay_to_ledger = item_data.pop('pay_to_ledger')
                amt = _safe_decimal(item_data.get('amount', 0))
                total += amt
                PaymentVoucherItem.objects.create(voucher=instance, pay_to_ledger=pay_to_ledger, **item_data)
            instance.total_amount = total
            instance.save(update_fields=['total_amount', 'updated_at'])

        return instance

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _post_to_global_voucher(self, voucher: PaymentVoucher):
        """
        Create / upsert a row in the global Voucher tracking table and post
        double-entry journal entries for every line item.
        """
        items = list(voucher.items.select_related('pay_to_ledger').all())
        total = voucher.total_amount

        # Upsert global Voucher record
        gv = Voucher.objects.filter(
            tenant_id=voucher.tenant_id,
            type='payment',
            voucher_number=voucher.voucher_number,
        ).first()

        if not gv:
            try:
                first_pay_to = items[0].pay_to_ledger.name if items else None
                gv = Voucher.objects.create(
                    tenant_id=voucher.tenant_id,
                    type='payment',
                    date=voucher.date,
                    voucher_number=voucher.voucher_number,
                    party=first_pay_to,
                    account=voucher.pay_from.name if voucher.pay_from else None,
                    amount=total,
                    total=total,
                    narration=voucher.narration,
                    source=voucher.source or 'manual',
                    reference_id=voucher.id,
                )
            except Exception as e:
                print(f"!!! Global Voucher creation failed for PaymentVoucher {voucher.id}: {e}")
                return

        # Store global voucher id on the payment record for reconciliation links
        setattr(voucher, '_accounting_voucher_id', gv.id)

        # Double-entry posting
        try:
            entries = []
            total_debit: Decimal = Decimal("0")

            for item in items:
                amt = _safe_decimal(item.amount)
                if amt > 0 and item.pay_to_ledger_id:
                    total_debit += amt  # type: ignore
                    entries.append({"ledger_id": item.pay_to_ledger_id, "debit": float(amt), "credit": 0})

            if total_debit > 0 and voucher.pay_from_id:  # type: ignore
                entries.append({
                    "ledger_id": voucher.pay_from_id,
                    "debit": 0,
                    "credit": float(total_debit),
                })
                if len(entries) >= 2:
                    voucher_type_label = "PAYMENT_BULK" if len(items) > 1 else "PAYMENT"
                    post_transaction(
                        voucher_type=voucher_type_label,
                        voucher_id=gv.id,
                        tenant_id=voucher.tenant_id,
                        entries=entries,
                    )
        except Exception as e:
            print(f"Error posting payment entries for voucher {voucher.id}: {e}")


# ---------------------------------------------------------------------------
# Backward-compatibility shims
# (Remove after frontend + bank-reconciliation view are fully migrated)
# ---------------------------------------------------------------------------

class VoucherPaymentSingleSerializer(PaymentVoucherSerializer):
    """
    DEPRECATED – kept so existing code that imports this name still works.
    Accepts the old single-payment payload shape and converts it to the new
    unified format before delegating to PaymentVoucherSerializer.create().
    """
    # Shim fields for validation (sent by frontend but not on model)
    pay_to = serializers.CharField(required=False)
    total_payment = serializers.DecimalField(max_digits=15, decimal_places=2, required=False, source='total_amount')
    advance_ref_no = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    advance_amount = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    transaction_details = serializers.JSONField(required=False, allow_null=True)
    bank_transaction_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:  # type: ignore
        model = PaymentVoucher
        # We must explicitly list all model + shim fields we want validated
        fields = [
            'id', 'date', 'voucher_type', 'voucher_number', 'pay_from', 'narration',
            'pay_to', 'total_payment', 'advance_ref_no', 'advance_amount', 
            'transaction_details', 'bank_transaction_id'
        ]

    def validate_pay_to(self, value):
        request = self.context.get('request')
        tenant_id = getattr(getattr(request, 'user', None), 'tenant_id', None)
        return _resolve_ledger(value, tenant_id)

    def create(self, validated_data):
        validated_data.pop('bank_transaction_id', None)

        if 'items' not in validated_data:
            pay_to    = validated_data.pop('pay_to', None)
            total_pmt = validated_data.pop('total_payment', Decimal('0'))
            adv_ref   = validated_data.pop('advance_ref_no', None)
            adv_amt   = validated_data.pop('advance_amount', Decimal('0'))
            txn_det   = validated_data.pop('transaction_details', None)

            items = []
            if pay_to is not None:
                # 1. Normal Payments (Mapped from transaction_details)
                if txn_det and isinstance(txn_det, list):
                    for detail in txn_det:
                        p_amt = _safe_decimal(detail.get('payment', 0))
                        if p_amt > 0:
                            items.append({
                                'pay_to_ledger': pay_to,
                                'amount': p_amt,
                                'reference_type': 'INVOICE',
                                'reference_id': None,
                                'transaction_details': detail
                            })
                
                # 2. Advance Payment (Converted to standard item)
                if adv_amt > 0:
                    items.append({
                        'pay_to_ledger': pay_to,
                        'amount': adv_amt,
                        'reference_type': 'ADVANCE',
                        'advance_ref_no': adv_ref,
                    })
                
                # 3. Fallback for simple payment without breakdown
                if not items and total_pmt > 0:
                    items.append({
                        'pay_to_ledger': pay_to,
                        'amount': total_pmt,
                        'reference_type': 'INVOICE',
                    })

            validated_data['items'] = items

        # Ensure total_amount is correctly set
        if 'total_payment' in validated_data:
            validated_data.setdefault('total_amount', validated_data.pop('total_payment'))
        
        return super().create(validated_data)


class VoucherPaymentBulkSerializer(PaymentVoucherSerializer):
    """
    DEPRECATED – kept so existing code that imports this name still works.
    Accepts the old bulk-payment payload shape and converts it to the new
    unified format.
    """
    payment_rows = serializers.JSONField(required=False)
    total_payment = serializers.DecimalField(max_digits=15, decimal_places=2, required=False, source='total_amount')
    posting_note = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    transaction_details = serializers.JSONField(required=False, allow_null=True)
    bank_transaction_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:  # type: ignore
        model = PaymentVoucher
        fields = [
            'id', 'date', 'voucher_type', 'voucher_number', 'pay_from',
            'payment_rows', 'posting_note', 'transaction_details', 'bank_transaction_id'
        ]

    def validate_payment_rows(self, value):
        request = self.context.get('request')
        tenant_id = getattr(getattr(request, 'user', None), 'tenant_id', None)
        items = []
        for row in value:
            pay_to_raw = row.get('payTo') or row.get('pay_to')
            amt = _safe_decimal(row.get('amount', 0))
            if pay_to_raw:
                pmt_ledger = _resolve_ledger(pay_to_raw, tenant_id)
                items.append({
                    'pay_to_ledger': pmt_ledger,
                    'amount': amt
                })
        return items

    def create(self, validated_data):
        validated_data.pop('bank_transaction_id', None)

        if 'payment_rows' in validated_data:
            raw_rows = validated_data.pop('payment_rows')
            adv_ref = validated_data.pop('advance_ref_no', None)
            adv_amt = _safe_decimal(validated_data.pop('advance_amount', 0))
            
            # 1. Main items
            items = []
            for item in raw_rows:
                items.append(item)
            
            # 2. Specific Advance for Bulk (if any)
            # If the user selected a vendor for advance in Bulk, it should be appended
            if adv_amt > 0:
                # In bulk, we usually linked advance to the 'selectedVendor' or specific row
                # If pay_from/pay_to is ambiguous here, the items list should already contain it.
                # However, many legacy calls send advance_amount at top level.
                pass 

            validated_data['items'] = items
            
            if 'posting_note' in validated_data:
                validated_data.setdefault('narration', validated_data.pop('posting_note'))

        return super().create(validated_data)
class AdvancePaymentSerializer(serializers.ModelSerializer):
    advance_ref_no = serializers.SerializerMethodField()
    date = serializers.DateField(source='voucher.date', read_only=True)
    pay_to_name = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()

    class Meta:
        model = PaymentVoucherItem
        fields = ['id', 'advance_ref_no', 'amount', 'date', 'pay_to_ledger', 'pay_to_name', 'category']

    def get_advance_ref_no(self, obj):
        # 1. Try to get the specific reference stored in transaction_details
        if obj.transaction_details and isinstance(obj.transaction_details, dict):
            ref = obj.transaction_details.get('reference_no')
            if ref: return ref
        
        # 2. Fallback to voucher number
        if obj.voucher:
            return obj.voucher.voucher_number
        return f"ADV-{obj.id}"

    def get_pay_to_name(self, obj):
        if not obj.pay_to_ledger: return None
        # Try both vendor and customer basic details via related name
        v = obj.pay_to_ledger.vendors_basic.first()
        if v: return v.vendor_name
        c = obj.pay_to_ledger.customers_basic.first()
        if c: return c.customer_name
        return obj.pay_to_ledger.ledger_name

    def get_category(self, obj):
        if not obj.pay_to_ledger: return None
        v = obj.pay_to_ledger.vendors_basic.first()
        if v: return v.vendor_category
        
        c = obj.pay_to_ledger.customers_basic.first()
        if c:
            if hasattr(c.customer_category, 'category'):
                return c.customer_category.category
            return str(c.customer_category) if c.customer_category else None
        return None
