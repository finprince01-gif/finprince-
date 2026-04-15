import uuid
from .utils_serializers import SafeModelSerializerMixin
print("DEBUG: Loading serializers_payment.py")
from rest_framework import serializers  # type: ignore[import]
from .models import (
    MasterLedger, Voucher, JournalEntry,
    PaymentVoucher, PaymentVoucherItem, VoucherAllocation,
    PendingTransaction, AdvanceAllocation, VoucherPendingTransaction
)  # type: ignore[import]


from accounting.services.ledger_service import post_transaction, _resolve_ledger
from decimal import Decimal, InvalidOperation
from django.utils import timezone
import datetime


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

class PaymentVoucherItemSerializer(SafeModelSerializerMixin, serializers.ModelSerializer):
    # Incoming fields for resolving ledger
    type = serializers.CharField(write_only=True, required=False)
    id_ref = serializers.IntegerField(write_only=True, required=False)
    advance_ref_no = serializers.CharField(write_only=True, required=False, allow_null=True, allow_blank=True)
    
    # Read-only display fields
    pay_to_ledger_name = serializers.CharField(source='pay_to_ledger.name', read_only=True)
    vendor_name = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    allocations = PaymentAllocationDetailSerializer(many=True, read_only=True, source='pending_transactions')
    transaction_details = serializers.JSONField(write_only=True, required=False)

    # Legacy field mappings
    amount = serializers.DecimalField(source='amount_applied', max_digits=20, decimal_places=2, required=False)
    amount_applied = serializers.DecimalField(max_digits=20, decimal_places=2, required=False)

    def to_internal_value(self, data):
        # Normalize reference_type to lowercase for choice validation (INVOICE -> invoice)
        if 'reference_type' in data and isinstance(data['reference_type'], str):
            data['reference_type'] = data['reference_type'].upper()
        return super().to_internal_value(data)

    class Meta:
        model = PendingTransaction
        fields = [
            'id', 'amount', 'amount_applied', 'reference_type', 'reference_id', 
            'reference_number', 'pending_amount', 'balance_after', 'invoice_date',
            'transaction_details', 'pay_to_ledger', 'pay_to_ledger_name',
            'type', 'id_ref', 'vendor_name', 'customer_name',
            'advance_ref_no', 'allocations'

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




class PaymentVoucherSerializer(SafeModelSerializerMixin, serializers.ModelSerializer):
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
    amount = serializers.DecimalField(max_digits=20, decimal_places=2, required=False)
    total_amount = serializers.DecimalField(max_digits=20, decimal_places=2, required=False)
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
        if isinstance(ledger, (int, str, Decimal)):
            try:
                ledger = MasterLedger.objects.get(pk=int(ledger))
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
            for item in voucher.get_items():
                # Find vendor master by ledger_id
                vendor = VendorMasterBasicDetail.objects.filter(
                    tenant_id=voucher.tenant_id, 
                    ledger_id=item.pay_to_ledger_id
                ).first()
                if vendor:
                    # Try to find a reference invoice number to link the payment in the ledger
                    ref_no = item.reference_number or item.advance_ref_no
                    
                    # If it's an advance, mark it accordingly
                    # Note: item.reference_type is a field on AllocationBase
                    p_status = 'Advance' if item.reference_type == 'ADVANCE' else 'Received'
                    
                    # Logic for reference number to match portal filters
                    # We prioritize 'ADVANCE' string for unallocated payments so they show up in the procurement reference list
                    ref_to_use = ref_no
                    if not ref_to_use or ref_to_use.strip() == '':
                        # Always prefer the actual voucher number for traceability in the portal
                        ref_to_use = voucher.voucher_number


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
                            'reference_number': ref_to_use,
                            'reference_type': item.reference_type,
                            'is_advance': (p_status == 'Advance'),
                            'notes': f"Payment for {ref_to_use}" if ref_to_use and ref_to_use != 'ADVANCE' else (voucher.narration or "Payment"),
                            'ledger_name': vendor.vendor_name or "Vendor"
                        }
                    )

                    # ── Also mark linked Purchase transaction(s) as Received ──────
                    # This ensures the Due/Not Due status in the procurement
                    # ledger flips to "Received" once a payment is recorded.
                    if p_status == 'Received':
                        if ref_no:
                            p_txn = VendorTransaction.objects.filter(
                                tenant_id=voucher.tenant_id,
                                vendor_id=vendor.id,
                                transaction_type='purchase',
                                reference_number=ref_no
                            ).exclude(status='Received').first()

                            if p_txn:
                                # Current payment for this invoice
                                current_payment = Decimal(str(item.amount or 0))
                                invoice_total = Decimal(str(p_txn.total_amount or 0))
                                
                                if current_payment >= invoice_total:
                                    p_txn.status = 'Received'
                                else:
                                    p_txn.status = 'Partially Received'
                                
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
            for item in voucher.get_items():
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
        from django.db import transaction as db_transaction
        request = self.context.get('request')
        tenant_id = getattr(request.user, 'tenant_id', None) if request else None
        
        # 1. Extract and Remove Non-DB Fields
        items_data = validated_data.pop('items', [])
        top_adv_ref = validated_data.pop('advance_ref_no', None)
        top_adv_amt = _safe_decimal(validated_data.pop('advance_amount', 0))
        pay_from_raw = validated_data.pop('pay_from', None)
        v_num_provided = validated_data.pop('voucher_number', None)
        v_date_provided = validated_data.pop('date', timezone.now().date())
        v_total_provided = validated_data.pop('total_amount', None)
        v_amt_provided = validated_data.pop('amount', None)
        v_narr_provided = validated_data.pop('narration', '')
        
        with db_transaction.atomic():
            # 2. Resolve Relationships
            pay_from_ledger = _resolve_ledger(pay_from_raw, tenant_id) if pay_from_raw else None
            
            # 3. Voucher Numbering
            from masters.models import MasterVoucherPayments
            series = MasterVoucherPayments.objects.filter(tenant_id=tenant_id, is_active=True).first()

            def _is_taken(v):
                from accounting.models import PaymentVoucher, AdvanceAllocation, PendingTransaction
                return (
                    PaymentVoucher.objects.filter(tenant_id=tenant_id, voucher_number=v).exists() or
                    AdvanceAllocation.objects.filter(tenant_id=tenant_id, transaction__voucher_number=v).exists() or
                    PendingTransaction.objects.filter(tenant_id=tenant_id, transaction__voucher_number=v).exists()
                )

            v_num_to_use = v_num_provided
            if series:
                expected_next = series.get_next_number()
                if not v_num_provided or v_num_provided == expected_next:
                    v_num_to_use = expected_next
                    while _is_taken(v_num_to_use):
                        series.increment_number()
                        v_num_to_use = series.get_next_number()
                    series.increment_number()
            
            if not v_num_to_use:
                v_num_to_use = f"PAY-{uuid.uuid4().hex[:6].upper()}"

            # 4. Calculate Total
            final_total = v_total_provided or v_amt_provided
            if not final_total:
                final_total = sum(_safe_decimal(i.get('amount_applied', i.get('amount', 0))) for i in items_data) + top_adv_amt

            # 5. Resolve Party IDs for both sides
            # Side A: pay_from (Internal Bank/Cash Ledger)
            pf_l_id, pf_c_id, pf_v_id = self._get_party_ids(pay_from_ledger) if pay_from_ledger else (None, None, None)
            
            # Side B: pay_to (The External Party - usually first item's ledger for header)
            first_it = items_data[0] if items_data else {}
            first_pay_to = _resolve_ledger(first_it.get('pay_to_ledger'), tenant_id) if first_it.get('pay_to_ledger') else None
            pt_l_id, pt_c_id, pt_v_id = self._get_party_ids(first_pay_to) if first_pay_to else (None, None, None)

            # 6. Create Header
            voucher = PaymentVoucher.objects.create(
                tenant_id=tenant_id,
                voucher_number=v_num_to_use,
                transaction_type='PAYMENT',
                date=v_date_provided,
                total_amount=final_total,
                amount=final_total, # Physical column
                narration=v_narr_provided,
                pay_from_ledger=pay_from_ledger,
                
                # Shared/Legacy party ID (pointing to EXTERNAL party for payments if possible, or bank)
                ledger_id_val=pt_l_id or pf_l_id,
                party_customer_id=pt_c_id or pf_c_id,
                party_vendor_id=pt_v_id or pf_v_id,

                # Side Specific (Payment context)
                pay_from_ledger_id_val=pf_l_id,
                pay_from_customer_id_val=pf_c_id,
                pay_from_vendor_id_val=pf_v_id,
                
                pay_to_ledger_id_val=pt_l_id,
                pay_to_customer_id_val=pt_c_id,
                pay_to_vendor_id_val=pt_v_id
            )

            # 7. Create allocations explicitly
            mode = 'payment_bulk' if len(items_data) > 1 else 'payment_single'
            
            # If no items/advance provided but total is positive, treat as automatic advance
            actual_adv_amt = top_adv_amt if top_adv_amt > 0 else (final_total if not items_data else 0)
            
            if actual_adv_amt > 0:
                AdvanceAllocation.objects.create(
                    tenant_id=tenant_id,
                    transaction=voucher,
                    type=mode,
                    reference_id='ADVANCE',
                    reference_type='ADVANCE',
                    reference_number=top_adv_ref or voucher.voucher_number,
                    pay_from_ledger=pay_from_ledger,
                    allocated_amount=actual_adv_amt,
                    amount=actual_adv_amt, # Physical column
                    original_amount=actual_adv_amt,
                    is_advance=True,
                    advance_ref_no=top_adv_ref or voucher.voucher_number,
                    details_party_name=pay_from_ledger.name if pay_from_ledger else None,
                    
                    # Side Specific
                    pay_from_ledger_id_val=pf_l_id,
                    pay_from_customer_id_val=pf_c_id,
                    pay_from_vendor_id_val=pf_v_id,

                    # Party sync
                    ledger_id_val=pt_l_id or pf_l_id,
                    party_customer_id=pt_c_id or pf_c_id,
                    party_vendor_id=pt_v_id or pf_v_id
                )

            for item_data in items_data:
                it_pay_to_raw = item_data.pop('pay_to_ledger', None)
                it_pending_raw = item_data.pop('transaction_details', {})
                it_amt = _safe_decimal(
                    item_data.get('amount_applied') or
                    item_data.get('amount') or 
                    item_data.get('received_amount') or 
                    item_data.get('payment') or 
                    item_data.get('receipt') or 0
                )
                it_type = (item_data.get('reference_type', 'invoice')).upper()
                it_ref_id = item_data.get('reference_id') or item_data.get('id')
                it_adv_ref = item_data.get('advance_ref_no')

                it_pay_to_ledger = _resolve_ledger(it_pay_to_raw, tenant_id) if it_pay_to_raw else None
                p_l_id, p_c_id, p_v_id = self._get_party_ids(it_pay_to_ledger) if it_pay_to_ledger else (None, None, None)

                det_ref = (
                    it_pending_raw.get('reference_number') or
                    it_pending_raw.get('reference_no') or 
                    it_pending_raw.get('ref_no') or 
                    it_pending_raw.get('invoiceNo') or
                    item_data.get('reference_number') or
                    item_data.get('reference_no') or 
                    item_data.get('advance_ref_no') or
                    it_adv_ref
                )
                det_party = it_pending_raw.get('party_name') or it_pending_raw.get('vendor_name')
                det_date = it_pending_raw.get('date') or it_pending_raw.get('invoice_date')

                target_model = AdvanceAllocation if it_type == 'ADVANCE' else PendingTransaction
                
                target_model.objects.create(
                    tenant_id=tenant_id,
                    transaction=voucher,
                    type=mode,
                    reference_id=str(it_ref_id) if it_ref_id else None,
                    reference_number=it_adv_ref or det_ref or str(it_ref_id) or v_num_to_use,
                    reference_type=it_type,
                    pay_to_ledger=it_pay_to_ledger,
                    pay_from_ledger=voucher.pay_from_ledger,
                    allocated_amount=it_amt,
                    amount=it_amt,
                    is_advance=(it_type == 'ADVANCE'),
                    advance_ref_no=it_adv_ref,
                    
                    # Concrete columns from frontend
                    due_date=it_pending_raw.get('due_date'),
                    due_status=it_pending_raw.get('due_status') or it_pending_raw.get('status'),
                    original_amount=it_amt,

                    invoice_date=det_date,
                    pending_before=_safe_decimal(item_data.get('pending_amount') or it_pending_raw.get('pending') or it_amt),
                    balance_after=_safe_decimal(item_data.get('balance_after', 0)),
                    
                    # Legacy sync
                    ledger_id_val=p_l_id,
                    party_vendor_id=p_v_id,
                    party_customer_id=p_c_id,

                    # Side Specific (Payment context)
                    pay_from_ledger_id_val=pf_l_id,
                    pay_from_customer_id_val=pf_c_id,
                    pay_from_vendor_id_val=pf_v_id,
                    
                    pay_to_ledger_id_val=p_l_id,
                    pay_to_customer_id_val=p_c_id,
                    pay_to_vendor_id_val=p_v_id
                )

            self._mirror_to_generic_voucher(voucher)
            self._mirror_to_vendor_portal(voucher)
            self._mirror_to_customer_portal(voucher)
            self._post_journal_entries(voucher)

            return voucher
        
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        instance = super().update(instance, validated_data)

        if items_data is not None:
            # Replace child items wholesale
            instance.delete_items()
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
            self._mirror_to_generic_voucher(instance)
            self._post_journal_entries(instance)

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
    def _mirror_to_generic_voucher(self, voucher: PaymentVoucher):
        """
        Create / upsert a row in the global Voucher tracking table.
        """
        try:
            items = list(voucher.get_items())
            total = voucher.total_amount

            # Extract names for the 'party' field
            party_names = []
            for item in items:
                name = item.pay_to_ledger.name if item.pay_to_ledger else "Unknown"
                if name not in party_names:
                    party_names.append(name)

            # Mirror to generic table
            gv = Voucher.objects.update_or_create(
                tenant_id=voucher.tenant_id,
                type='payment',
                voucher_number=voucher.voucher_number,
                defaults={
                    'date': voucher.date,
                    'party': ", ".join(party_names) if party_names else "Multiple",
                    'account': voucher.pay_from_ledger.name if voucher.pay_from_ledger else None,
                    'amount': total,
                    'total': total,
                    'narration': voucher.narration,
                    'source': getattr(voucher, 'source', 'manual'),
                    'reference_id': voucher.id,
                    'ledger_id_val': voucher.ledger_id_val,
                    'party_customer_id': voucher.party_customer_id,
                    'party_vendor_id': voucher.party_vendor_id,
                }
            )
        except Exception as e:
            print(f"!!! Global Voucher mirror failed for Payment {voucher.id}: {e}")

    def _post_journal_entries(self, voucher: PaymentVoucher):
        """
        Post double-entry journal records.
        """
        try:
            items = list(voucher.get_items())
            entries = []
            total_debit = Decimal("0")

            for item in items:
                amt = _safe_decimal(item.amount)
                if amt > 0:
                    total_debit += amt
                    entries.append({
                        "ledger_id": item.pay_to_ledger_id, 
                        "debit": float(amt), 
                        "credit": 0,
                        "ledger_id_val": item.ledger_id_val,
                        "party_customer_id": item.party_customer_id,
                        "party_vendor_id": item.party_vendor_id,
                        "vendor_id": item.party_vendor_id,
                        "customer_id": item.party_customer_id
                    })

            if total_debit > 0 and voucher.pay_from_ledger:
                entries.append({
                    "ledger_id": voucher.pay_from_ledger_id,
                    "debit": 0,
                    "credit": float(total_debit),
                    "ledger_id_val": voucher.ledger_id_val,
                    "party_customer_id": voucher.party_customer_id,
                    "party_vendor_id": voucher.party_vendor_id
                })
                
                if len(entries) >= 2:
                    post_transaction(
                        voucher_type="PAYMENT",
                        voucher_id=voucher.id,
                        tenant_id=voucher.tenant_id,
                        entries=entries,
                        transaction_date=voucher.date,
                        voucher_number=voucher.voucher_number
                    )
        except Exception as e:
            print(f"Error posting payment entries for voucher {voucher.id}: {e}")

    # Mirroring implementations move to the top of the class for better visibility


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



