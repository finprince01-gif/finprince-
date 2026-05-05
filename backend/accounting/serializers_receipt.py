import uuid
from .utils_serializers import SafeModelSerializerMixin
from decimal import Decimal, InvalidOperation
from rest_framework import serializers # type: ignore
from .models import (
    MasterLedger, Voucher, JournalEntry,
    ReceiptVoucher, ReceiptVoucherItem, VoucherAllocation,
    PendingTransaction, AdvanceAllocation
)  # type: ignore
from accounting.services.ledger_service import post_transaction, _resolve_ledger
import datetime
from django.utils import timezone
from accounting.services.sales_status_service import update_sales_invoice_payment_status

class ReceiptAllocationDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendingTransaction
        fields = [
            'id', 'invoice_date', 'reference_number', 'reference_type',
            'total_amount', 'amount_applied', 'pending_amount', 'balance_after'
        ]

def _safe_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")

class ReceiptVoucherItemSerializer(SafeModelSerializerMixin, serializers.ModelSerializer):
    customer = serializers.CharField(required=False, allow_null=True)
    # Read-only display fields
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    allocations = ReceiptAllocationDetailSerializer(many=True, read_only=True, source='pending_transactions')
    pending_transaction = serializers.JSONField(write_only=True, required=False)

    # Legacy field mappings
    received_amount = serializers.DecimalField(source='amount_applied', max_digits=25, decimal_places=2, required=False)
    amount = serializers.DecimalField(source='amount_applied', max_digits=25, decimal_places=2, required=False)
    amount_applied = serializers.DecimalField(max_digits=25, decimal_places=2, required=False)
    advance_ref_no = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def to_internal_value(self, data):
        # Normalize reference_type to uppercase for choice validation (INVOICE -> INVOICE)
        if 'reference_type' in data and isinstance(data['reference_type'], str):
            val = data['reference_type'].upper()
            if val == 'OTHERS':
                val = 'ON_ACCOUNT'
            data['reference_type'] = val
        return super().to_internal_value(data)

    class Meta:
        model = PendingTransaction
        fields = [
            'id', 'customer', 'customer_name', 'reference_id', 'reference_type', 
            'pending_transaction', 'amount', 'amount_applied', 'pending_before', 'received_amount', 
            'balance_after', 'is_advance', 'advance_ref_no', 'ref_no', 'invoice_date',
            'allocations', 'narration', 'posting_note'
        ]
        extra_kwargs = {
            'balance_after': {'max_digits': 25, 'decimal_places': 2},
        }

    def validate_customer(self, value):
        request = self.context.get('request')
        tenant_id = request.user.branch_id if request and hasattr(request.user, 'tenant_id') else None
        
        if value and not isinstance(value, MasterLedger):
            ledger = _resolve_ledger(value, tenant_id)
            if ledger:
                return ledger
            
            # If not found in MasterLedger, check Portal Customers
            from customerportal.models import CustomerMasterCustomer
            portal_cust = CustomerMasterCustomer.objects.filter(
                tenant_id=tenant_id, 
                customer_name__iexact=str(value).strip()
            ).first()
            
            if portal_cust:
                ledger = MasterLedger.objects.filter(
                    tenant_id=tenant_id, 
                    name__iexact=portal_cust.customer_name
                ).first()
                if not ledger:
                    try:
                        ledger = MasterLedger.objects.create(
                            tenant_id=tenant_id,
                            name=portal_cust.customer_name,
                            group='Sundry Debtors',
                            category='Asset'
                        )
                        # Link back
                        portal_cust.ledger_id = ledger.id
                        portal_cust.save(update_fields=['ledger_id'])
                    except Exception:
                        ledger = MasterLedger.objects.filter(
                            tenant_id=tenant_id, 
                            name__iexact=portal_cust.customer_name
                        ).first()
                return ledger
            
            # If still not found, check Portal Vendors
            from vendors.models import VendorMasterBasicDetail
            portal_vend = VendorMasterBasicDetail.objects.filter(
                tenant_id=tenant_id,
                vendor_name__iexact=str(value).strip()
            ).first()

            if portal_vend:
                ledger = MasterLedger.objects.filter(
                    tenant_id=tenant_id,
                    name__iexact=portal_vend.vendor_name
                ).first()
                if not ledger:
                    try:
                        ledger = MasterLedger.objects.create(
                            tenant_id=tenant_id,
                            name=portal_vend.vendor_name,
                            group='Sundry Creditors',
                            category='Liability'
                        )
                        # Link back
                        portal_vend.ledger_id = ledger.id
                        portal_vend.save(update_fields=['ledger_id'])
                    except Exception:
                        ledger = MasterLedger.objects.filter(
                            tenant_id=tenant_id,
                            name__iexact=portal_vend.vendor_name
                        ).first()
                return ledger
                
            return None # Fallback
        return value

class ReceiptVoucherSerializer(SafeModelSerializerMixin, serializers.ModelSerializer):
    items = ReceiptVoucherItemSerializer(many=True, required=False)
    
    # Handle both ID and Name in POST
    receive_in = serializers.CharField(required=False, allow_null=True)
    customer = serializers.CharField(required=False, allow_null=True)
    type = serializers.CharField(required=False, default='receipt', allow_null=True)
    voucher_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    narration = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    ref_no = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    amount = serializers.DecimalField(max_digits=25, decimal_places=2, required=False)
    total_amount = serializers.DecimalField(max_digits=25, decimal_places=2, required=False)
    total_receipt = serializers.SerializerMethodField()

    def get_total_receipt(self, obj):
        return getattr(obj, 'total_amount', getattr(obj, 'amount', 0))

    class Meta:
        model = Voucher
        fields = '__all__'
        extra_kwargs = {
            'total_amount': {'max_digits': 15, 'decimal_places': 2, 'required': False},
            'amount': {'max_digits': 15, 'decimal_places': 2, 'required': False},
            'type': {'required': False},
            'voucher_number': {'required': False},
        }

    def _get_party_ids(self, ledger):
        """Extract vendor/customer database IDs from a MasterLedger."""
        l_id = ledger.id
        from vendors.models import VendorMasterBasicDetail
        from customerportal.database import CustomerMasterCustomerBasicDetails
        
        v = VendorMasterBasicDetail.objects.filter(ledger_id=l_id).first()
        c = CustomerMasterCustomerBasicDetails.objects.filter(ledger_id=l_id).first()
        
        return (l_id, c.id if c else None, v.id if v else None)

    def create(self, validated_data):
        from django.db import transaction as db_transaction
        request = self.context.get('request')
        tenant_id = request.user.branch_id if request and hasattr(request.user, 'tenant_id') else None
        
        # 1. Extract and Remove Non-DB Fields
        items_data = validated_data.pop('items', [])
        receive_in_raw = validated_data.pop('receive_in', None)
        customer_raw = validated_data.pop('customer', None)
        total_p_provided = validated_data.pop('total_amount', None)
        amount_provided = validated_data.pop('amount', None) 
        v_num_provided = validated_data.pop('voucher_number', None)
        v_date_provided = validated_data.pop('date', timezone.now().date())
        v_narr_provided = validated_data.pop('narration', '')
        v_ref_no_provided = validated_data.pop('ref_no', '')
        v_posting_note = validated_data.pop('notes', '') or validated_data.pop('posting_note', '')
        
        with db_transaction.atomic():
            # 2. Resolve Relationships
            receive_in_ledger = _resolve_ledger(receive_in_raw, tenant_id) if receive_in_raw else None
            customer_ledger = _resolve_ledger(customer_raw, tenant_id) if customer_raw else None
            
            # 3. Voucher Numbering
            from masters.models import MasterVoucherReceipts
            series = MasterVoucherReceipts.objects.filter(tenant_id=tenant_id, is_active=True).first()

            def _is_taken(v):
                from accounting.models import ReceiptVoucher, AdvanceAllocation, PendingTransaction
                return (
                    ReceiptVoucher.objects.filter(tenant_id=tenant_id, voucher_number=v).exists() or
                    AdvanceAllocation.objects.filter(tenant_id=tenant_id, transaction__voucher_number=v).exists() or
                    PendingTransaction.objects.filter(tenant_id=tenant_id, transaction__voucher_number=v).exists()
                )

            v_num_to_use = v_num_provided
            if series:
                expected_next = series.get_next_number()
                # If no number provided, or it matches expected, or it's ALREADY TAKEN, auto-generate/increment
                if not v_num_to_use or v_num_to_use == expected_next or _is_taken(v_num_to_use):
                    if not v_num_to_use:
                        v_num_to_use = expected_next
                        
                    while _is_taken(v_num_to_use):
                        series.increment_number()
                        v_num_to_use = series.get_next_number()
                    series.increment_number()
            
            if not v_num_to_use:
                v_num_to_use = f"REC-{uuid.uuid4().hex[:6].upper()}"

            # 4. Calculate Total
            final_total = total_p_provided or amount_provided
            if not final_total:
                final_total = sum(_safe_decimal(i.get('received_amount', i.get('amount', 0))) for i in items_data)

            # 5. Resolve Party IDs for both sides
            # Side A: receive_from (The External Party - Customer/Vendor/Ledger)
            rf_l_id, rf_c_id, rf_v_id = self._get_party_ids(customer_ledger) if customer_ledger else (None, None, None)
            
            # Side B: receive_in (The Internal Bank/Cash Ledger)
            ri_l_id, ri_c_id, ri_v_id = self._get_party_ids(receive_in_ledger) if receive_in_ledger else (None, None, None)

            # 6. Create Header
            receipt = ReceiptVoucher.objects.create(
                tenant_id=tenant_id,
                voucher_number=v_num_to_use,
                transaction_type='RECEIPT',
                date=v_date_provided,
                total_amount=final_total,
                amount=final_total, # Physical column
                vouch_amount=final_total,
                narration=v_narr_provided,
                ref_no=v_ref_no_provided,
                posting_note=v_posting_note,
                pay_to_ledger=receive_in_ledger,
                pay_from_ledger=customer_ledger,
                
                # Shared/Legacy party ID
                ledger_id_val=rf_l_id,
                party_customer_id=rf_c_id,
                party_vendor_id=rf_v_id,

                # Side Specific (Receive context)
                receive_from_ledger_id_val=rf_l_id,
                receive_from_customer_id_val=rf_c_id,
                receive_from_vendor_id_val=rf_v_id,
                
                receive_in_ledger_id_val=ri_l_id,
                receive_in_customer_id_val=ri_c_id,
                receive_in_vendor_id_val=ri_v_id
            )

            # 7. Create Items and Allocations
            mode = 'receipt_bulk' if len(items_data) > 1 else 'receipt_single'
            
            # Calculate sum of allocated items
            sum_items = sum(_safe_decimal(i.get('received_amount', i.get('amount', 0))) for i in items_data)
            
            # If total_amount > sum of items, allocate the remainder as an advance
            remainder_adv = Decimal('0.00')
            if not items_data:
                remainder_adv = final_total
            else:
                remainder_adv = max(Decimal('0.00'), final_total - sum_items)

            if remainder_adv > 0:
                AdvanceAllocation.objects.create(
                    tenant_id=tenant_id,
                    transaction=receipt,
                    type=mode,
                    reference_id='ADVANCE',
                    reference_number=receipt.voucher_number,
                    reference_type='ADVANCE',
                    pay_from_ledger=customer_ledger,
                    pay_to_ledger=receipt.pay_to_ledger,
                    allocated_amount=remainder_adv,
                    amount=remainder_adv, # Physical column
                    original_amount=remainder_adv,
                    is_advance=True,
                    advance_ref_no=receipt.voucher_number,
                    ref_no=v_ref_no_provided,
                    posting_note=v_posting_note,
                    vouch_amount=receipt.vouch_amount,
                    
                    # Core IDs
                    ledger_id_val=rf_l_id,
                    party_customer_id=rf_c_id,
                    party_vendor_id=rf_v_id,

                    # Side Specific
                    receive_from_ledger_id_val=rf_l_id,
                    receive_from_customer_id_val=rf_c_id,
                    receive_from_vendor_id_val=rf_v_id,
                    
                    receive_in_ledger_id_val=ri_l_id,
                    receive_in_customer_id_val=ri_c_id,
                    receive_in_vendor_id_val=ri_v_id
                )

            for item_data in items_data:
                # Extract item-level non-DB fields
                it_party_raw = item_data.pop('customer', None)
                it_pending_raw = item_data.pop('pending_transaction', {})
                it_amt = _safe_decimal(
                    item_data.get('amount_applied') or
                    item_data.get('received_amount') or 
                    item_data.get('amount') or 
                    item_data.get('receipt') or 
                    item_data.get('payment') or 0
                )
                it_type = (item_data.get('reference_type', 'invoice')).upper()
                it_ref_id = item_data.get('reference_id') or item_data.get('id')

                # Metadata normalization
                det_ref = (
                    it_pending_raw.get('reference_no') or 
                    it_pending_raw.get('ref_no') or 
                    it_pending_raw.get('invoiceNo') or
                    item_data.get('reference_no') or
                    item_data.get('advance_ref_no')
                )
                det_party = it_pending_raw.get('party_name') or it_pending_raw.get('customer_name')
                det_date = it_pending_raw.get('date') or it_pending_raw.get('invoice_date')

                # Resolve Item Ledger
                it_party_ledger = _resolve_ledger(it_party_raw, tenant_id) if it_party_raw else customer_ledger
                p_l_id, p_c_id, p_v_id = self._get_party_ids(it_party_ledger) if it_party_ledger else (None, None, None)
                
                # Determine Target Detail Model
                target_model = AdvanceAllocation if it_type == 'ADVANCE' else PendingTransaction
                
                # 7.1 Create the allocation record (PendingTransaction or AdvanceAllocation)
                target_model.objects.create(
                    tenant_id=tenant_id,
                    transaction=receipt,
                    type=mode,
                    reference_id=str(it_ref_id) if it_ref_id else None,
                    reference_number=det_ref or str(it_ref_id) or v_num_to_use,
                    reference_type=it_type,
                    pay_from_ledger=it_party_ledger,
                    pay_to_ledger=receipt.pay_to_ledger,
                    allocated_amount=it_amt,
                    amount=it_amt, # Physical column
                    is_advance=(it_type == 'ADVANCE'),
                    advance_ref_no=det_ref if it_type == 'ADVANCE' else None,
                    ref_no=item_data.get('ref_no', v_ref_no_provided),
                    narration=item_data.get('narration') or v_narr_provided,
                    posting_note=(
                        item_data.get('posting_note') or 
                        item_data.get('postingNote') or 
                        item_data.get('narration') or 
                        item_data.get('notes') or 
                        v_posting_note
                    ),
                    vouch_amount=receipt.vouch_amount,
                    
                    # Concrete columns from frontend
                    due_date=it_pending_raw.get('due_date'),
                    due_status=it_pending_raw.get('due_status') or it_pending_raw.get('status'),
                    original_amount=it_amt,
                    
                    invoice_date=det_date,
                    pending_before=_safe_decimal(item_data.get('pending_before') or it_pending_raw.get('pending') or it_amt),
                    balance_after=_safe_decimal(item_data.get('balance_after', 0)),
                    
                    # Party Sync
                    ledger_id_val=p_l_id,
                    party_customer_id=p_c_id,
                    party_vendor_id=p_v_id,

                    # Detailed Sync
                    receive_from_ledger_id_val=p_l_id,
                    receive_from_customer_id_val=p_c_id,
                    receive_from_vendor_id_val=p_v_id,
                    
                    receive_in_ledger_id_val=ri_l_id,
                    receive_in_customer_id_val=ri_c_id,
                    receive_in_vendor_id_val=ri_v_id
                )

            # Mirroring and Posting
            self._mirror_to_generic_voucher(receipt)
            self._mirror_to_vendor_portal(receipt)
            self._mirror_to_customer_portal(receipt)
            self._post_journal_entries(receipt)

            # --- Update Payment Status in Sales Module ---
            try:
                # Track unique invoice IDs to avoid redundant updates.
                # Skip advance-type items: their `id` is an advance source row id,
                # not a VoucherSalesInvoiceDetails id.
                updated_invoices = set()
                for item in items_data:
                    ref_type = str(item.get('reference_type', '')).upper()
                    if ref_type == 'ADVANCE':
                        continue  # Advance receipts don't link to a sales invoice directly
                    it_ref_id = item.get('reference_id')
                    if it_ref_id and str(it_ref_id) not in updated_invoices:
                        update_sales_invoice_payment_status(tenant_id, str(it_ref_id))
                        updated_invoices.add(str(it_ref_id))
            except Exception as e:
                print(f"!!! Status Sync Error: {str(e)}")

            return receipt
        
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        instance = super().update(instance, validated_data)
        
        if items_data is not None:
            instance.delete_items()
            total = Decimal("0")
            for item_data in items_data:
                customer_data = item_data.pop('customer', None)
                customer_ledger = customer_data if isinstance(customer_data, MasterLedger) else None
                
                i_l_id, i_c_id, i_v_id = self._get_party_ids(customer_ledger)
                amt = _safe_decimal(item_data.get('received_amount', item_data.get('amount', 0)))
                total += amt

                # Use PendingTransaction for consistency with create()
                PendingTransaction.objects.create(
                    voucher=instance,
                    tenant_id=instance.tenant_id,
                    ledger_id_val=i_l_id,
                    party_customer_id=i_c_id,
                    party_vendor_id=i_v_id,
                    pay_from_ledger=customer_ledger,
                    pay_to_ledger=instance.pay_to_ledger,
                    vouch_amount=instance.vouch_amount,
                    **item_data
                )
            instance.total_amount = total
            instance.amount = total
            instance.vouch_amount = total
            instance.save(update_fields=['total_amount', 'amount', 'vouch_amount', 'updated_at'])
        
        self._mirror_to_generic_voucher(instance)
        self._mirror_to_customer_portal(instance)
        self._mirror_to_vendor_portal(instance)
        self._post_journal_entries(instance)

        # Update Payment Status in Sales Module
        try:
            items_qs = instance.get_items()
            updated_invoices = set()
            for item in items_qs:
                if item.reference_id and str(item.reference_id) not in updated_invoices:
                    update_sales_invoice_payment_status(instance.tenant_id, str(item.reference_id))
                    updated_invoices.add(str(item.reference_id))
        except Exception as e:
            print(f"!!! Status Sync Update Error: {str(e)}")
        
        return instance

    def _mirror_to_generic_voucher(self, receipt):
        """Unified voucher for cross-module reports"""
        try:
            items_qs = receipt.get_items()
            items_data = []
            party_names = set()
            for item in items_qs:
                # Use pay_from_ledger (customer/vendor) for party name resolution
                item_party = getattr(item, 'pay_from_ledger', None) or receipt.pay_from_ledger
                if item_party:
                    party_names.add(item_party.name)
                
                items_data.append({
                    "customer": item_party.name if item_party else "Unknown",
                    "reference_type": getattr(item, 'reference_type', 'invoice'),
                    "amount": float(getattr(item, 'amount', 0)),
                    "received_amount": float(getattr(item, 'allocated_amount', 0)),
                    "is_advance": getattr(item, 'is_advance', False),
                    "advance_ref_no": getattr(item, 'advance_ref_no', None)
                })

            Voucher.objects.create(
                tenant_id=receipt.tenant_id,
                voucher_number=receipt.voucher_number,
                type='receipt',
                date=receipt.date,
                party=", ".join(party_names) if party_names else "Bulk",
                account=getattr(receipt.receive_in, 'name', None),
                amount=receipt.amount,
                total=receipt.total_amount,
                source=getattr(receipt, 'source', 'manual'),
                reference_id=receipt.id,
                items_data=items_data,
                ledger_id_val=receipt.ledger_id_val,
                party_customer_id=receipt.party_customer_id,
                party_vendor_id=receipt.party_vendor_id
            )
        except Exception as e:
            import traceback
            print(f"[ReceiptSerializer] _mirror_to_generic_voucher failed: {e}\n{traceback.format_exc()}")
    def _mirror_to_vendor_portal(self, receipt):
        """Mirror Vendor specific receipts to the Vendor Portal ledger"""
        from vendors.models import VendorMasterBasicDetail, VendorTransaction
        from .models import TransactionAllocation
        try:
            # First, clean up any existing mirrored transactions for this receipt to prevent duplicates
            VendorTransaction.objects.filter(
                tenant_id=receipt.tenant_id,
                transaction_number__startswith=f"{receipt.voucher_number}-",
                transaction_type__in=['payment', 'receipt']
            ).delete()

            seen_refs = set()
            items = list(receipt.get_items())
            has_new_items = any(type(i).__name__ not in ('TransactionAllocation', 'VoucherAllocation', 'PaymentVoucherItem') for i in items)
            if has_new_items:
                items = [i for i in items if type(i).__name__ not in ('TransactionAllocation', 'VoucherAllocation', 'PaymentVoucherItem')]

            for item in items:
                # Use pay_from_ledger (customer/vendor) for party name resolution
                ref_no = item.reference_number or item.advance_ref_no
                dedup_key = f"{ref_no}_{item.amount}"
                if dedup_key in seen_refs:
                    continue
                seen_refs.add(dedup_key)

                party = getattr(item, 'pay_from_ledger', None) or receipt.pay_from_ledger
                if not party:
                    continue

                try:
                    vendor = VendorMasterBasicDetail.objects.filter(
                        tenant_id=receipt.tenant_id, 
                        ledger_id=party.id
                    ).first()
                    
                    if not vendor:
                        vendor = VendorMasterBasicDetail.objects.filter(
                            tenant_id=receipt.tenant_id, 
                            vendor_name__iexact=party.name
                        ).first()
                    
                    if vendor:
                        p_status = 'Advance' if (item.is_advance or item.reference_type == 'advance') else 'Received'
                        
                        VendorTransaction.objects.update_or_create(
                            tenant_id=receipt.tenant_id,
                            vendor_id=vendor.id,
                            transaction_number=f"{receipt.voucher_number}-{item.id}",
                            transaction_type='receipt',
                            defaults={
                                'transaction_date': receipt.date,
                                'amount': item.received_amount,
                                'total_amount': item.received_amount,
                                'status': p_status,
                                'reference_number': item.reference_id or receipt.voucher_number,
                                'notes': receipt.notes,
                                'ledger_name': receipt.receive_in.name if receipt.receive_in else 'Direct Receipt'
                            }
                        )
                except Exception:
                    pass
        except Exception:
            pass

    def _mirror_to_customer_portal(self, receipt):
        """Cross-database sync to Customer Portal table (customer_transaction)"""
        from .models import TransactionAllocation
        from customerportal.models import CustomerTransaction as CustomerTxnPortal
        try:
            CustomerTxnPortal.objects.filter(
                tenant_id=receipt.tenant_id,
                transaction_number__startswith=f"{receipt.voucher_number}-",
                transaction_type__in=['payment', 'receipt']
            ).delete()

            from customerportal.models import CustomerTransaction, CustomerMasterCustomer
            
            seen_refs = set()
            items = list(receipt.get_items())
            has_new_items = any(type(i).__name__ not in ('TransactionAllocation', 'VoucherAllocation', 'PaymentVoucherItem') for i in items)
            if has_new_items:
                items = [i for i in items if type(i).__name__ not in ('TransactionAllocation', 'VoucherAllocation', 'PaymentVoucherItem')]

            for item in items:
                # Deduplicate
                ref_no = item.reference_number or item.advance_ref_no
                dedup_key = f"{ref_no}_{item.amount}"
                if dedup_key in seen_refs:
                    continue
                seen_refs.add(dedup_key)

                metadata = item.pending_transaction if hasattr(item, 'pending_transaction') and isinstance(item.pending_transaction, dict) else {}
                metadata_name = metadata.get('customer_name')
                
                # Robust customer lookup
                portal_customer = None
                
                # 1. Try by direct FK (pay_from_ledger stores the party)
                item_party = getattr(item, 'pay_from_ledger', None) or receipt.pay_from_ledger
                if item_party:
                    portal_customer = CustomerMasterCustomer.objects.filter(
                        tenant_id=receipt.tenant_id, 
                        customer_name__iexact=item_party.name
                    ).first()
                
                # 2. Try by ledger_id (most reliable for core engine)
                if not portal_customer and hasattr(item, 'ledger_id_val') and item.ledger_id_val:
                    portal_customer = CustomerMasterCustomer.objects.filter(
                        tenant_id=receipt.tenant_id, 
                        ledger_id=item.ledger_id_val
                    ).first()
                
                # 3. Try by metadata name
                if not portal_customer and metadata_name:
                    portal_customer = CustomerMasterCustomer.objects.filter(
                        tenant_id=receipt.tenant_id, 
                        customer_name__iexact=metadata_name
                    ).first()
                
                if portal_customer:
                    try:
                        ref_no = metadata.get('invoiceNo') or metadata.get('sales_invoice_no')
                        if not ref_no and item.reference_id and str(item.reference_id).isdigit():
                            from .models_voucher_sales import VoucherSalesInvoiceDetails
                            inv = VoucherSalesInvoiceDetails.objects.filter(id=item.reference_id, tenant_id=receipt.tenant_id).first()
                            if inv:
                                ref_no = inv.sales_invoice_no
                        
                        if not ref_no:
                            ref_no = item.reference_id or receipt.voucher_number
                        
                        is_adv = (getattr(item, 'is_advance', False) or (getattr(item, 'reference_type', '').upper() == 'ADVANCE') or not getattr(item, 'reference_id', None))
                        
                        # Use Resolved Ref No for linking, fallback to voucher number
                        ref_no_to_use = ref_no or receipt.voucher_number


                        CustomerTransaction.objects.update_or_create(
                            tenant_id=receipt.tenant_id,
                            customer_id=portal_customer.id,
                            transaction_number=f"{receipt.voucher_number}-{item.id}",
                            transaction_type='receipt',
                            defaults={
                                'transaction_date': receipt.date,
                                'amount': item.received_amount,
                                'total_amount': item.received_amount,
                                'payment_status': 'Advance' if is_adv else 'Partially Utilized',
                                'reference_number': ref_no_to_use,
                                'notes': receipt.narration
                            }
                        )
                    except Exception:
                        pass
        except Exception:
            pass

    def _post_journal_entries(self, receipt):
        """Post the double-entry transactions"""
        try:
            total_decimal = Decimal(str(receipt.total_amount))
            if total_decimal <= 0: return

            entries = []

            # Debit side: the bank/cash account money flows INTO (pay_to_ledger on Transaction = receive_in)
            receive_in_ledger = getattr(receipt, 'pay_to_ledger', None)
            if not receive_in_ledger:
                # Fallback to receive_in_ledger_id_val
                if receipt.receive_in_ledger_id_val:
                    from accounting.models import MasterLedger
                    receive_in_ledger = MasterLedger.objects.filter(id=receipt.receive_in_ledger_id_val).first()

            if not receive_in_ledger:
                print(f"[ReceiptSerializer] No receive_in ledger for receipt {receipt.id} - skipping journal entries")
                return

            entries.append({
                "ledger_id": receive_in_ledger.id,
                "debit": float(total_decimal),
                "credit": 0,
            })

            # Credit side: the customer/party ledger (pay_from_ledger on Transaction = receive_from)
            customer_data_map = {}
            for item in receipt.get_items():
                lid = (
                    item.ledger_id_val
                    or (item.pay_from_ledger.id if item.pay_from_ledger else None)
                )
                if not lid:
                    continue
                amt = Decimal(str(item.received_amount))
                if lid not in customer_data_map:
                    customer_data_map[lid] = {
                        "amount": Decimal("0"),
                        "c_id": item.party_customer_id,
                        "v_id": item.party_vendor_id
                    }
                customer_data_map[lid]["amount"] += amt

            # If no items resolved, fall back to pay_from_ledger on the header
            if not customer_data_map:
                from_ledger = getattr(receipt, 'pay_from_ledger', None)
                if from_ledger:
                    customer_data_map[from_ledger.id] = {
                        "amount": total_decimal,
                        "c_id": receipt.party_customer_id,
                        "v_id": receipt.party_vendor_id
                    }

            for lid, data in customer_data_map.items():
                amt = data["amount"]
                if amt > 0:
                    entries.append({
                        "ledger_id": lid,
                        "debit": 0,
                        "credit": float(amt),
                        "ledger_id_val": lid,
                        "party_customer_id": data["c_id"],
                        "party_vendor_id": data["v_id"],
                    })

            if len(entries) >= 2:
                post_transaction(
                    voucher_type="RECEIPT",
                    voucher_id=receipt.id,
                    tenant_id=receipt.tenant_id,
                    entries=entries,
                    transaction_date=receipt.date,
                    voucher_number=receipt.voucher_number
                )
        except Exception as e:
            import traceback
            print(f"[ReceiptSerializer] _post_journal_entries failed for {receipt.id}: {e}\n{traceback.format_exc()}")

    def _safe_int(self, val):
        if val is None: return None
        try:
            return int(float(str(val)))
        except:
            return None

    def _get_party_ids(self, ledger):
        if not ledger: return None, None, None
        if isinstance(ledger, (int, str, Decimal)):
            try:
                from accounting.models import MasterLedger
                ledger = MasterLedger.objects.get(pk=int(ledger))
            except:
                try: return int(float(str(ledger))), None, None
                except: return None, None, None
        try:
            vendor = getattr(ledger, 'vendors_basic', None)
            vid = vendor.first().id if vendor and vendor.exists() else None
            customer = getattr(ledger, 'customers_basic', None)
            cid = customer.first().id if customer and customer.exists() else None
            return ledger.id, cid, vid
        except:
            return getattr(ledger, 'id', None), None, None

# Backward compatibility shims
VoucherReceiptSingleSerializer = ReceiptVoucherSerializer
VoucherReceiptBulkSerializer = ReceiptVoucherSerializer
