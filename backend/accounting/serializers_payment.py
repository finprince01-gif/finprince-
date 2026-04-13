import uuid
print("DEBUG: Loading serializers_payment.py")
from rest_framework import serializers  # type: ignore[import]
from .models_pending_transaction import PendingTransaction
from .models_advance_allocation import AdvanceAllocation
from .models import (
    MasterLedger, Voucher, JournalEntry,
    PaymentVoucher, PaymentVoucherItem
)  # type: ignore[import]
from accounting.services.ledger_service import post_transaction, _resolve_ledger
from decimal import Decimal, InvalidOperation


def _safe_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


class PaymentAllocationDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendingTransaction
        fields = [
            'id', 'invoice_date', 'reference_number', 'reference_type',
            'total_amount', 'amount_applied', 'pending_amount', 'balance_after'
        ]

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
    allocations = PaymentAllocationDetailSerializer(many=True, read_only=True, source='pending_transactions')
    transaction_details = serializers.JSONField(write_only=True, required=False)

    # Legacy field mappings
    amount = serializers.DecimalField(source='amount_applied', max_digits=20, decimal_places=2, required=False)

    def to_internal_value(self, data):
        # Normalize reference_type to lowercase for choice validation (INVOICE -> invoice)
        if 'reference_type' in data and isinstance(data['reference_type'], str):
            data['reference_type'] = data['reference_type'].lower()
        return super().to_internal_value(data)

    class Meta:
        model = PendingTransaction
        fields = [
            'id', 'pay_to_ledger', 'pay_to_ledger_name', 'vendor_name', 'customer_name', 
            'invoice_date', 'advance_ref_no', 'reference_number', 'reference_type', 
            'amount', 'pending_amount', 'amount_applied', 'balance_after', 
            'type', 'id_ref', 'allocations', 'transaction_details'
        ]
        extra_kwargs = {
            'pay_to_ledger': {'required': False, 'allow_null': True},
            'reference_type': {'required': False},
            'advance_ref_no': {'write_only': True, 'required': False},
            'balance_after': {'max_digits': 20, 'decimal_places': 2},
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




class PaymentVoucherSerializer(serializers.ModelSerializer):
    pay_from_name = serializers.CharField(source='pay_from.name', read_only=True)
    pay_from = serializers.CharField(required=False, allow_null=True)
    type = serializers.CharField(required=False, default='payment', allow_null=True)
    voucher_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    narration = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    total_payment = serializers.SerializerMethodField()

    def get_total_payment(self, obj):
        return getattr(obj, 'total_amount', getattr(obj, 'amount', 0))
    
    # Optional Top-Level Advance (for backward compatibility / bulk)
    advance_ref_no = serializers.CharField(required=False, allow_null=True, allow_blank=True, write_only=True)
    advance_amount = serializers.DecimalField(max_digits=20, decimal_places=2, required=False, write_only=True)
    items = PaymentVoucherItemSerializer(many=True, required=False)

    def _safe_int(self, val):
        if val is None: return None
        try:
            return int(float(str(val)))
        except:
            return None

    def _get_party_ids(self, ledger):
        """Extract vendor/customer database IDs from a MasterLedger."""
        if not ledger: return None, None, None
        
        # If passed as ID, resolve the object first
        if isinstance(ledger, (int, str)):
            try:
                ledger = MasterLedger.objects.get(pk=ledger)
            except:
                return self._safe_int(ledger), None, None

        l_id = ledger.id
        from vendors.models import VendorMasterBasicDetail
        from customerportal.database import CustomerMasterCustomerBasicDetails
        
        v = VendorMasterBasicDetail.objects.filter(ledger_id=l_id).first()
        c = CustomerMasterCustomerBasicDetails.objects.filter(ledger_id=l_id).first()
        
        return (l_id, c.id if c else None, v.id if v else None)

    def _mirror_to_vendor_portal(self, voucher):
        """Mirror PaymentVoucher items to Vendor Portal ledger"""
        from vendors.models import VendorMasterBasicDetail, VendorTransaction
        try:
            for item in voucher.items.all():
                # Find vendor master by ledger_id
                vendor = VendorMasterBasicDetail.objects.filter(
                    tenant_id=voucher.tenant_id, 
                    ledger_id=item.pay_to_ledger_id
                ).first()
                if vendor:
                    # Try to find a reference invoice number to link the payment in the ledger
                    ref_no = None
                    if item.transaction_details and isinstance(item.transaction_details, dict):
                        ref_no = (
                            item.transaction_details.get('invoice_no')
                            or item.transaction_details.get('reference_no')
                            or item.transaction_details.get('referenceNumber') # Case from Single Mode
                            or item.transaction_details.get('invoiceNo')       # Case from Bulk Mode
                        )

                    # If it's an advance, mark it accordingly
                    p_status = 'Advance' if item.reference_type == 'ADVANCE' else 'Paid'
                    
                    VendorTransaction.objects.update_or_create(
                        tenant_id=voucher.tenant_id,
                        vendor_id=vendor.id,
                        # Composite key for unique items
                        transaction_number=f"{voucher.voucher_number}-{item.id}",
                        transaction_type='payment',
                        defaults={
                            'transaction_date': voucher.date,
                            'amount': item.amount,
                            'total_amount': item.amount,
                            'status': p_status,
                            'reference_number': ref_no or item.advance_ref_no or voucher.voucher_number,
                            'notes': f"Payment for {ref_no}" if ref_no else voucher.narration,
                            'ledger_name': vendor.vendor_name
                        }
                    )

                    # ── Also mark linked Purchase transaction(s) as Paid ──────
                    # This ensures the Due/Not Due status in the procurement
                    # ledger flips to "Paid" once a payment is recorded.
                    if p_status == 'Paid':
                        if ref_no:
                            p_txn = VendorTransaction.objects.filter(
                                tenant_id=voucher.tenant_id,
                                vendor_id=vendor.id,
                                transaction_type='purchase',
                                reference_number=ref_no
                            ).exclude(status='Paid').first()

                            if p_txn:
                                # Current payment for this invoice
                                current_payment = Decimal(str(item.amount or 0))
                                invoice_total = Decimal(str(p_txn.total_amount or 0))
                                
                                if current_payment >= invoice_total:
                                    p_txn.status = 'Paid'
                                else:
                                    p_txn.status = 'Partially Paid'
                                
                                p_txn.save()
                                print(f"!!! Vendor Purchase {ref_no} marked {p_txn.status} for {vendor.vendor_name}")
                        else:
                            print(f"!!! No ref_no found for item {item.id}, skipping blanket Paid update.")

        except Exception as e:
            print(f"!!! Vendor Portal Sync Failure (Payment): {str(e)}")

    def _mirror_to_customer_portal(self, voucher):
        """Mirror PaymentVoucher items to Customer Portal ledger (if applicable)"""
        from customerportal.database import CustomerMasterCustomerBasicDetails, CustomerTransaction
        try:
            for item in voucher.items.all():
                # Find customer master by ledger_id
                customer = CustomerMasterCustomerBasicDetails.objects.filter(
                    tenant_id=voucher.tenant_id, 
                    ledger_id=item.pay_to_ledger_id
                ).first()
                if customer:
                    # If it's an advance, mark it accordingly
                    p_status = 'Advance' if item.reference_type == 'ADVANCE' else 'Paid'
                    
                    CustomerTransaction.objects.update_or_create(
                        tenant_id=voucher.tenant_id,
                        customer_id=customer.id,
                        # Composite key for unique items
                        transaction_number=f"{voucher.voucher_number}-{item.id}",
                        transaction_type='payment',
                        defaults={
                            'transaction_date': voucher.date,
                            'amount': item.amount,
                            'total_amount': item.amount,
                            'payment_status': p_status,
                            'reference_number': voucher.voucher_number,
                            'notes': voucher.narration
                        }
                    )
        except Exception as e:
            print(f"!!! Customer Portal Sync Failure (Payment): {str(e)}")

    class Meta:
        model = Voucher
        fields = '__all__'
        extra_kwargs = {
            'type': {'required': False},
            'voucher_number': {'required': False},
        }

    def create(self, validated_data):
        import traceback
        try:
            return self._do_create(validated_data)
        except Exception:
            traceback.print_exc()
            raise

    def _do_create(self, validated_data):
        request = self.context.get('request')
        tenant_id = getattr(request.user, 'tenant_id', None) if request else None
        
        items_data = validated_data.pop('items', [])
        top_adv_ref = validated_data.pop('advance_ref_no', None)
        top_adv_amt = _safe_decimal(validated_data.pop('advance_amount', 0))

        # Detect Mode (Single vs Bulk)
        mode = 'payment_single'
        if isinstance(self, VoucherPaymentBulkSerializer):
            mode = 'payment_bulk'

        # Auto numbering and validation
        v_num_provided = validated_data.get('voucher_number')
        from masters.models import MasterVoucherPayments
        series = MasterVoucherPayments.objects.filter(tenant_id=tenant_id, is_active=True).first()

        def _is_taken(v):
            from accounting.models import PaymentVoucher, AdvanceAllocation
            return (
                PaymentVoucher.objects.filter(tenant_id=tenant_id, voucher_number=v).exists() or
                AdvanceAllocation.objects.filter(tenant_id=tenant_id, voucher_number=v).exists()
            )

        if series:
            expected_next = series.get_next_number()
            # If no number provided, OR user provided the expected auto-generated number
            if not v_num_provided or v_num_provided == expected_next:
                v_num_to_use = expected_next
                # Fast forward if somehow already taken
                while _is_taken(v_num_to_use):
                    series.increment_number()
                    v_num_to_use = series.get_next_number()
                
                validated_data['voucher_number'] = v_num_to_use
                series.increment_number()
            else:
                # Custom number provided.
                if _is_taken(v_num_provided):
                    # Robust fallback: The frontend likely sent a stale auto-generated number 
                    # that got taken in another tab. We force an auto-increment instead of failing.
                    v_num_to_use = expected_next
                    while _is_taken(v_num_to_use):
                        series.increment_number()
                        v_num_to_use = series.get_next_number()
                    
                    validated_data['voucher_number'] = v_num_to_use
                    series.increment_number()
        else:
            if not v_num_provided:
                validated_data['voucher_number'] = f"PAY-{uuid.uuid4().hex[:6].upper()}"

        v_num  = validated_data['voucher_number']
        v_date = validated_data.get('date') or datetime.date.today()
        v_narr = validated_data.get('narration', '')
        v_from = validated_data.get('pay_from')
        if v_from and not isinstance(v_from, MasterLedger):
            v_from = _resolve_ledger(v_from, tenant_id)
        
        # Resolve Pay From Name
        v_from_name = v_from.name if v_from else ''

        # Compute Total
        total_p = sum(_safe_decimal(i.get('amount_applied', 0)) for i in items_data) + top_adv_amt
        if total_p == 0: total_p = validated_data.get('total_amount', 0)

        # Storage for constructed response
        saved_items = []

        # 1. Process Main Items
        for item_data in items_data:
            pay_to = item_data.get('pay_to_ledger')
            if not pay_to: continue
            
            l_id, c_id, v_id = self._get_party_ids(pay_to)
            txn_details = item_data.get('transaction_details', {})
            
            ref_type = item_data.get('reference_type', 'invoice').lower()
            amt      = _safe_decimal(item_data.get('amount_applied', 0))
            
            if ref_type == 'advance':
                adv = AdvanceAllocation.objects.create(
                    tenant_id=tenant_id,
                    type=mode,
                    voucher_number=v_num,
                    voucher_date=v_date,
                    narration=v_narr,
                    pay_from_ledger_id=v_from.id if getattr(v_from, 'id', None) else v_from,
                    pay_to_ledger_id=pay_to.id if getattr(pay_to, 'id', None) else pay_to,
                    vendor_id=v_id,
                    customer_id=c_id,
                    advance_ref_no=item_data.get('advance_ref_no') or txn_details.get('reference_no') or v_num,
                    advance_amount=amt,
                    total_amount=total_p,
                    source='manual'
                )
                saved_items.append(adv)
            else:
                pt = PendingTransaction.objects.create(
                    tenant_id=tenant_id,
                    type=mode,
                    voucher_number=v_num,
                    voucher_date=v_date,
                    narration=v_narr,
                    pay_from_ledger_id=v_from.id if getattr(v_from, 'id', None) else v_from,
                    pay_to_ledger_id=pay_to.id if getattr(pay_to, 'id', None) else pay_to,
                    vendor_id=v_id,
                    customer_id=c_id,
                    reference_number=item_data.get('reference_number') or txn_details.get('invoiceNo') or txn_details.get('referenceNumber'),
                    reference_type='invoice',
                    invoice_date=item_data.get('invoice_date'),
                    amount_applied=amt,
                    pending_amount=_safe_decimal(item_data.get('pending_amount', 0)),
                    balance_after=_safe_decimal(item_data.get('balance_after', 0)),
                    status='paid' if amt > 0 else 'pending'
                )
                saved_items.append(pt)

        # 2. Process Top-Level Advance (if any)
        if top_adv_amt > 0:
            # We need a party for this. Pick from first item or use a default if missing.
            party = items_data[0].get('pay_to_ledger') if items_data else None
            if party:
                l_id, c_id, v_id = self._get_party_ids(party)
                adv = AdvanceAllocation.objects.create(
                    tenant_id=tenant_id,
                    type=mode,
                    voucher_number=v_num,
                    voucher_date=v_date,
                    narration=v_narr,
                    pay_from_ledger=v_from,
                    pay_to_ledger=party,
                    vendor_id=v_id,
                    customer_id=c_id,
                    advance_ref_no=top_adv_ref or v_num,
                    advance_amount=top_adv_amt,
                    total_amount=total_p,
                )
                saved_items.append(adv)

        # Mock Object for internal processing (Portals, Global Voucher)
        mock_voucher = type('MockVoucher', (), {
            'id': uuid.uuid4().int & ((1<<63)-1), # Safe for MySQL Signed BIGINT
            'tenant_id': tenant_id,
            'date': v_date,
            'voucher_number': v_num,
            'pay_from': v_from,
            'pay_from_id': v_from.id if getattr(v_from, 'id', None) else v_from,
            'narration': v_narr,
            'total_amount': total_p,
            'source': 'manual',
            'ledger_id_val': saved_items[0].pay_to_ledger_id if saved_items else None,
            'party_customer_id': saved_items[0].customer_id if saved_items else None,
            'party_vendor_id': saved_items[0].vendor_id if saved_items else None,
            'items': type('MockItems', (), {
                'all': lambda self: self.items_list,
                '__iter__': lambda self: iter(self.items_list),
                'select_related': lambda self, *args: self,
                'prefetch_related': lambda self, *args: self,
                'items_list': [
                    type('MockItem', (), {
                        'id': item.id,
                        'pay_to_ledger_id': item.pay_to_ledger_id,
                        'pay_to_ledger': item.pay_to_ledger,
                        'amount': getattr(item, 'amount_applied', getattr(item, 'advance_amount', 0)),
                        'reference_type': 'ADVANCE' if isinstance(item, AdvanceAllocation) else 'INVOICE',
                        'advance_ref_no': getattr(item, 'advance_ref_no', None),
                        'ledger_id_val': item.pay_to_ledger_id,
                        'party_customer_id': item.customer_id,
                        'party_vendor_id': item.vendor_id,
                        'transaction_details': {}
                    }) for item in saved_items
                ]
            })()
        })

        # Logic Sync
        self._post_to_global_voucher(mock_voucher)
        self._mirror_to_vendor_portal(mock_voucher)
        self._mirror_to_customer_portal(mock_voucher)

        # Prepare Response Data (Attach data as dict if needed, or just return mock)
        # Note: By returning mock_voucher, we satisfy the view's need for .id
        return mock_voucher

        self._post_to_global_voucher(voucher)
        self._mirror_to_vendor_portal(voucher)
        self._mirror_to_customer_portal(voucher)
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
                item_instance = PaymentVoucherItem.objects.create(voucher=instance, pay_to_ledger=pay_to_ledger, **item_data)
                self._sync_allocations(item_instance, item_instance.transaction_details)
            instance.total_amount = total
            instance.save(update_fields=['total_amount', 'updated_at'])
            
            self._mirror_to_vendor_portal(instance)
            self._mirror_to_customer_portal(instance)
            self._post_to_global_voucher(instance)

        return instance

    def _sync_allocations(self, item_instance, details):
        """Sync transaction_details breakdown to common VoucherPendingTransaction table."""
        if not details: return
        import json
        if isinstance(details, str):
            try: details = json.loads(details)
            except: return
        
        if isinstance(details, dict): details = [details]
        if not isinstance(details, list): return

        # Delete existing common allocations
        VoucherPendingTransaction.objects.filter(payment_item=item_instance).delete()
        
        for d in details:
            if not isinstance(d, dict): continue
            VoucherPendingTransaction.objects.create(
                payment_item=item_instance,
                tenant_id=item_instance.tenant_id,
                invoice_no=d.get('referenceNumber', d.get('invoiceNo', d.get('invoice_no', ''))),
                invoice_date=d.get('date'),
                total_amount=_safe_decimal(d.get('amount', 0)),
                amount_applied=_safe_decimal(d.get('payment', d.get('payNow', d.get('paid_amount', 0)))),
                pending_amount=_safe_decimal(d.get('pending', 0)),
                balance_after=_safe_decimal(d.get('balance_after', 0)),
                is_advance=d.get('advance', d.get('is_advance', False)),
                advance_ref_no=d.get('reference_no') or d.get('advanceRefNo')
            )

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
                    ledger_id_val=voucher.ledger_id_val,
                    party_customer_id=voucher.party_customer_id,
                    party_vendor_id=voucher.party_vendor_id,
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

            from customerportal.database import CustomerMasterCustomerBasicDetails
            from vendors.models import VendorMasterBasicDetail

            for item in items:
                amt = _safe_decimal(item.amount)
                if amt > 0 and item.pay_to_ledger_id:
                    total_debit += amt  # type: ignore
                    # Resolve vendor or customer ID for this ledger
                    v_id = None
                    c_id = None
                    vendor = VendorMasterBasicDetail.objects.filter(tenant_id=voucher.tenant_id, ledger_id=item.pay_to_ledger_id).first()
                    if vendor:
                        v_id = vendor.id
                    else:
                        customer = CustomerMasterCustomerBasicDetails.objects.filter(tenant_id=voucher.tenant_id, ledger_id=item.pay_to_ledger_id).first()
                        if customer:
                            c_id = customer.id
                    
                    entries.append({
                        "ledger_id": item.pay_to_ledger_id, 
                        "debit": float(amt), 
                        "credit": 0,
                        "ledger_id_val": item.ledger_id_val,
                        "party_customer_id": item.party_customer_id,
                        "party_vendor_id": item.party_vendor_id,
                        "vendor_id": v_id,
                        "customer_id": c_id
                    })

            if total_debit > 0 and voucher.pay_from_id:  # type: ignore
                entries.append({
                    "ledger_id": voucher.pay_from_id,
                    "debit": 0,
                    "credit": float(total_debit),
                    "ledger_id_val": voucher.ledger_id_val,
                    "party_customer_id": voucher.party_customer_id,
                    "party_vendor_id": voucher.party_vendor_id
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
    total_payment = serializers.DecimalField(max_digits=20, decimal_places=2, required=False, source='total_amount')
    advance_ref_no = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    advance_amount = serializers.DecimalField(max_digits=20, decimal_places=2, required=False)
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
    total_payment = serializers.DecimalField(max_digits=20, decimal_places=2, required=False, source='total_amount')
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
    date = serializers.SerializerMethodField()
    pay_to_name = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    pay_to_ledger = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()
    allocated = serializers.SerializerMethodField()

    amount = serializers.SerializerMethodField()

    class Meta:
        # Note: Accepts AdvanceAllocation, PaymentVoucherItem, ReceiptVoucherItem
        model = AdvanceAllocation 
        fields = [
            'id', 'date', 'advance_ref_no', 'pay_to_ledger', 'pay_to_name', 
            'category', 'amount', 'allocated', 'remaining'
        ]

    def get_amount(self, obj):
        return getattr(obj, 'advance_amount', getattr(obj, 'amount', getattr(obj, 'received_amount', Decimal('0.00'))))

    def get_remaining(self, obj):
        amt = self.get_amount(obj)
        return getattr(obj, '_remaining', Decimal(str(amt)))

    def get_allocated(self, obj):
        return getattr(obj, '_allocated', Decimal('0.00'))

    def get_advance_ref_no(self, obj):
        if hasattr(obj, 'advance_ref_no') and obj.advance_ref_no:
            return obj.advance_ref_no
            
        if hasattr(obj, 'transaction_details') and obj.transaction_details and isinstance(obj.transaction_details, dict):
            ref = obj.transaction_details.get('reference_no')
            if ref: return ref
        
        if getattr(obj, 'voucher', None):
            return obj.voucher.voucher_number
        if getattr(obj, 'voucher_number', None):
            return obj.voucher_number
            
        return f"ADV-{obj.id}"

    def get_pay_to_ledger(self, obj):
        ledger = getattr(obj, 'pay_to_ledger', None) or getattr(obj, 'customer', None)
        return getattr(ledger, 'id', ledger)

    def get_date(self, obj):
        return getattr(obj, 'voucher_date', getattr(getattr(obj, 'voucher', None), 'date', None))

    def get_pay_to_name(self, obj):
        ledger = getattr(obj, 'pay_to_ledger', None) or getattr(obj, 'customer', None)
        if not ledger: return None
        # Try both vendor and customer basic details via related name
        v = ledger.vendors_basic.first()
        if v: return v.vendor_name
        c = ledger.customers_basic.first()
        if c: return c.customer_name
        return ledger.name

    def get_category(self, obj):
        ledger = getattr(obj, 'pay_to_ledger', None) or getattr(obj, 'customer', None)
        if not ledger: return None
        v = ledger.vendors_basic.first()
        if v: return v.vendor_category
        c = ledger.customers_basic.first()
        if c: 
            # In some models it might be a related object or just a string
            cat_obj = getattr(c, 'customer_category', None)
            if hasattr(cat_obj, 'category'): return cat_obj.category # type: ignore
            return str(cat_obj) if cat_obj else None
        return None


