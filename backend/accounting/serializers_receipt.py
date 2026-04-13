import uuid
from decimal import Decimal, InvalidOperation
from rest_framework import serializers # type: ignore
from .models_pending_transaction import PendingTransaction
from .models_advance_allocation import AdvanceAllocation
from .models import (
    MasterLedger, Voucher, JournalEntry,
    ReceiptVoucher, ReceiptVoucherItem
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

class ReceiptVoucherItemSerializer(serializers.ModelSerializer):
    customer = serializers.CharField(required=False, allow_null=True)
    # Read-only display fields
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    allocations = ReceiptAllocationDetailSerializer(many=True, read_only=True, source='pending_transactions')
    pending_transaction = serializers.JSONField(write_only=True, required=False)

    # Legacy field mappings
    received_amount = serializers.DecimalField(source='amount_applied', max_digits=20, decimal_places=2, required=False)
    amount = serializers.DecimalField(source='amount_applied', max_digits=20, decimal_places=2, required=False)
    advance_ref_no = serializers.CharField(required=False, allow_null=True) # Used during create()

    def to_internal_value(self, data):
        # Normalize reference_type to lowercase for choice validation (INVOICE -> invoice)
        if 'reference_type' in data and isinstance(data['reference_type'], str):
            data['reference_type'] = data['reference_type'].lower()
        return super().to_internal_value(data)

    class Meta:
        model = PendingTransaction
        fields = [
            'id', 'customer', 'customer_name', 'invoice_date', 'advance_ref_no', 
            'reference_number', 'reference_type', 'amount', 'pending_amount', 
            'received_amount', 'amount_applied', 'balance_after',
            'allocations', 'pending_transaction'
        ]
        extra_kwargs = {
            'balance_after': {'max_digits': 20, 'decimal_places': 2},
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

class ReceiptVoucherSerializer(serializers.ModelSerializer):
    items = ReceiptVoucherItemSerializer(many=True, required=False)
    
    # Handle both ID and Name in POST
    receive_in = serializers.CharField(required=False, allow_null=True)
    customer = serializers.CharField(required=False, allow_null=True)
    type = serializers.CharField(required=False, default='receipt', allow_null=True)
    voucher_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    narration = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    total_receipt = serializers.SerializerMethodField()

    def get_total_receipt(self, obj):
        return getattr(obj, 'total_amount', getattr(obj, 'amount', 0))

    class Meta:
        model = Voucher
        fields = '__all__'
        extra_kwargs = {
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
        request = self.context.get('request')
        tenant_id = request.user.branch_id if request and hasattr(request.user, 'tenant_id') else None
        
        items_data = validated_data.pop('items', [])
        
        # Detect Mode
        mode = 'receipt_single'
        from .views_receipt import VoucherReceiptBulkViewSet
        # This is a bit brittle, but we can check the context or just use single by default
        # Actually safer to check if items > 1
        if len(items_data) > 1:
            mode = 'receipt_bulk'

        # Auto numbering and validation
        v_num_provided = validated_data.get('voucher_number')
        from masters.models import MasterVoucherReceipts
        series = MasterVoucherReceipts.objects.filter(tenant_id=tenant_id, is_active=True).first()

        def _is_taken(v):
            from accounting.models import ReceiptVoucher, AdvanceAllocation
            from accounting.models_pending_transaction import PendingTransaction
            return (
                ReceiptVoucher.objects.filter(tenant_id=tenant_id, voucher_number=v).exists() or
                AdvanceAllocation.objects.filter(tenant_id=tenant_id, type__in=['receipt_single', 'receipt_bulk'], voucher_number=v).exists() or
                PendingTransaction.objects.filter(tenant_id=tenant_id, type__in=['receipt_single', 'receipt_bulk'], voucher_number=v).exists()
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
                validated_data['voucher_number'] = f"REC-{uuid.uuid4().hex[:6].upper()}"
        
        v_num  = validated_data['voucher_number']
        v_date = validated_data.get('date') or timezone.now().date()
        v_narr = validated_data.get('narration', '')
        v_in   = validated_data.get('receive_in')
        if v_in and not isinstance(v_in, MasterLedger):
            v_in = _resolve_ledger(v_in, tenant_id)
        v_in_name = v_in.name if v_in else ''

        total_p = validated_data.get('amount') or validated_data.get('total_amount') or 0
        if total_p == 0:
            total_p = sum(_safe_decimal(i.get('amount_applied', 0)) for i in items_data)

        saved_items = []

        for item_data in items_data:
            party = item_data.get('customer')
            if not party: continue
            
            l_id, c_id, v_id = self._get_party_ids(party)
            txn_details = item_data.get('pending_transaction', {})
            
            ref_type = item_data.get('reference_type', 'invoice').lower()
            amt      = _safe_decimal(item_data.get('amount_applied', 0))
            
            if ref_type == 'advance' or item_data.get('is_advance'):
                adv = AdvanceAllocation.objects.create(
                    tenant_id=tenant_id,
                    type=mode,
                    voucher_number=v_num,
                    voucher_date=v_date,
                    narration=v_narr,
                    pay_from_ledger_id=v_in.id if getattr(v_in, 'id', None) else v_in,
                    pay_to_ledger_id=party.id if getattr(party, 'id', None) else party,
                    vendor_id=v_id,
                    customer_id=c_id,
                    advance_ref_no=item_data.get('advance_ref_no') or v_num,
                    advance_amount=amt,
                    total_amount=total_p,
                )
                saved_items.append(adv)
            else:
                pt = PendingTransaction.objects.create(
                    tenant_id=tenant_id,
                    type=mode,
                    voucher_number=v_num,
                    voucher_date=v_date,
                    narration=v_narr,
                    pay_from_ledger_id=v_in.id if getattr(v_in, 'id', None) else v_in,
                    pay_to_ledger_id=party.id if getattr(party, 'id', None) else party,
                    vendor_id=v_id,
                    customer_id=c_id,
                    reference_number=item_data.get('reference_number') or txn_details.get('invoiceNo') or txn_details.get('referenceNumber'),
                    reference_type='invoice',
                    invoice_date=item_data.get('invoice_date'),
                    amount_applied=amt,
                    pending_amount=_safe_decimal(item_data.get('pending_before', 0)),
                    balance_after=_safe_decimal(item_data.get('balance_after', 0)),
                )
                saved_items.append(pt)

        # Mock for sync
        mock_receipt = type('MockReceipt', (), {
            'id': uuid.uuid4().int & ((1<<63)-1),
            'tenant_id': tenant_id,
            'date': v_date,
            'voucher_number': v_num,
            'receive_in': v_in,
            'narration': v_narr,
            'amount': total_p,
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
                        'customer': item.pay_to_ledger,
                        'pay_to_ledger': item.pay_to_ledger, # Alias for consistency
                        'pay_to_ledger_id': item.pay_to_ledger_id,
                        'amount': getattr(item, 'amount_applied', getattr(item, 'advance_amount', 0)),
                        'received_amount': getattr(item, 'amount_applied', getattr(item, 'advance_amount', 0)),
                        'reference_type': 'ADVANCE' if isinstance(item, AdvanceAllocation) else 'INVOICE',
                        'is_advance': isinstance(item, AdvanceAllocation),
                        'advance_ref_no': getattr(item, 'advance_ref_no', None),
                        'ledger_id_val': item.pay_to_ledger_id,
                        'party_customer_id': item.customer_id,
                        'party_vendor_id': item.vendor_id,
                    }) for item in saved_items
                ]
            })()
        })

        self._mirror_to_generic_voucher(mock_receipt)
        self._mirror_to_customer_portal(mock_receipt)
        self._mirror_to_vendor_portal(mock_receipt)
        self._post_journal_entries(mock_receipt)

        # Return the mock object to satisfy the view's .id access
        return mock_receipt

        self._mirror_to_generic_voucher(receipt)
        self._mirror_to_customer_portal(receipt)
        self._mirror_to_vendor_portal(receipt)
        self._post_journal_entries(receipt)

        return receipt

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        instance = super().update(instance, validated_data)
        
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                customer_data = item_data.pop('customer', None)
                customer_ledger = customer_data if isinstance(customer_data, MasterLedger) else None
                
                i_l_id, i_c_id, i_v_id = self._get_party_ids(customer_ledger)
                
                ReceiptVoucherItem.objects.create(
                    voucher=instance,
                    tenant_id=instance.tenant_id,
                    ledger_id_val=i_l_id,
                    party_customer_id=i_c_id,
                    party_vendor_id=i_v_id,
                    customer=customer_ledger,
                    **item_data
                )
        
        self._mirror_to_generic_voucher(instance)
        self._mirror_to_customer_portal(instance)
        self._mirror_to_vendor_portal(instance)
        self._post_journal_entries(instance)
        
        return instance

    def _sync_allocations(self, item_instance, details):
        """Sync pending_transaction JSON to common VoucherPendingTransaction table."""
        if not details: return
        import json
        if isinstance(details, str):
            try: details = json.loads(details)
            except: return
        
        if isinstance(details, dict): details = [details]
        if not isinstance(details, list): return

        # Delete existing common allocations
        VoucherPendingTransaction.objects.filter(receipt_item=item_instance).delete()
        
        for d in details:
            if not isinstance(d, dict): continue
            VoucherPendingTransaction.objects.create(
                receipt_item=item_instance,
                tenant_id=item_instance.tenant_id,
                invoice_no=d.get('invoiceNo', d.get('referenceNumber', d.get('invoice_no', ''))),
                invoice_date=d.get('date'),
                total_amount=_safe_decimal(d.get('amount', 0)),
                pending_amount=_safe_decimal(d.get('pendingBefore', d.get('pending', 0))),
                amount_applied=_safe_decimal(d.get('receivedAmount', d.get('payment', 0))),
                balance_after=_safe_decimal(d.get('balanceAfter', 0)),
                is_advance=d.get('isAdvance', d.get('advance', False)),
                advance_ref_no=d.get('advanceRefNo', '')
            )

    def _mirror_to_generic_voucher(self, receipt):
        """Unified voucher for cross-module reports"""
        try:
            items_qs = receipt.items.all()
            items_data = []
            party_names = set()
            for item in items_qs:
                if item.customer:
                    party_names.add(item.customer.name)
                items_data.append({
                    "customer": item.customer.name if item.customer else "Unknown",
                    "reference_type": item.reference_type,
                    "amount": float(item.amount),
                    "received_amount": float(item.received_amount),
                    "is_advance": item.is_advance,
                    "advance_ref_no": item.advance_ref_no
                })

            Voucher.objects.create(
                tenant_id=receipt.tenant_id,
                voucher_number=receipt.voucher_number,
                type='receipt',
                date=receipt.date,
                party=", ".join(party_names) if party_names else "Bulk",
                account=receipt.receive_in.name if receipt.receive_in else None,
                amount=receipt.amount,
                total=receipt.total_amount,
                source=receipt.source or 'manual',
                reference_id=receipt.id,
                items_data=items_data,
                ledger_id_val=receipt.ledger_id_val,
                party_customer_id=receipt.party_customer_id,
                party_vendor_id=receipt.party_vendor_id
            )
        except Exception:
            pass
    def _mirror_to_vendor_portal(self, receipt):
        """Mirror Vendor specific receipts to the Vendor Portal ledger"""
        from vendors.models import VendorMasterBasicDetail, VendorTransaction
        try:
            items_qs = receipt.items.all()
            for item in items_qs:
                party = item.customer
                if not party:
                    # Fallback to main voucher customer
                    party = receipt.customer
                
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
                            # Composite key for unique items
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
        try:
            from customerportal.models import CustomerTransaction, CustomerMasterCustomer
            
            for item in receipt.items.all():
                # Standardize resolution by metadata if available
                metadata = item.pending_transaction if isinstance(item.pending_transaction, dict) else {}
                metadata_name = metadata.get('customer_name')
                
                # Use metadata name if it exists, otherwise fallback to ledger name
                lookup_name = metadata_name if metadata_name else (str(item.customer.name).strip() if item.customer else None)
                
                if not lookup_name:
                    continue

                try:
                    # Resolve portal customer record (CustomerMasterCustomer in database.py)
                    portal_customer = CustomerMasterCustomer.objects.filter(
                        tenant_id=receipt.tenant_id, 
                        customer_name__iexact=lookup_name
                    ).first()
                    
                    if portal_customer:
                        # RESOLVE: Reference Number (Invoice Number) for proper portal grouping
                        # Try metadata first, then resolve from ID if numeric, then fallback
                        ref_no = metadata.get('invoiceNo') or metadata.get('sales_invoice_no')
                        
                        if not ref_no and item.reference_id and str(item.reference_id).isdigit():
                            from .models_voucher_sales import VoucherSalesInvoiceDetails
                            inv = VoucherSalesInvoiceDetails.objects.filter(id=item.reference_id, tenant_id=receipt.tenant_id).first()
                            if inv:
                                ref_no = inv.sales_invoice_no
                        
                        if not ref_no:
                            ref_no = item.reference_id or receipt.voucher_number
                        
                        # Map transaction types to portal-specific statuses
                        is_adv = (item.is_advance or item.reference_type == 'advance' or not item.reference_id)
                        p_status = 'Advance' if is_adv else 'Received'
                        
                        # Use update_or_create to avoid duplicates on retries
                        # Use a composite key for transaction_number to prevent overwriting different items or different allocations on the same voucher
                        CustomerTransaction.objects.update_or_create(
                            tenant_id=receipt.tenant_id,
                            customer_id=portal_customer.id,
                            transaction_number=f"{receipt.voucher_number}-{item.id}",
                            transaction_type='RECEIPT',
                            defaults={
                                'transaction_date': receipt.date,
                                'amount': item.received_amount,
                                'total_amount': item.received_amount,
                                'payment_status': p_status,
                                'reference_number': ref_no,
                                'notes': receipt.notes or f"Receipt for {item.reference_id}"
                            }
                        )
                        print(f"!!! Portal Mirror OK: {lookup_name} (ID: {portal_customer.id})")
                    else:
                        print(f"!!! Portal Mirror Error: Portal customer '{lookup_name}' not found")
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
            # Debit: Bank/Cash
            entries.append({
                "ledger_id": receipt.receive_in.id, 
                "debit": float(total_decimal), 
                "credit": 0,
                "ledger_id_val": receipt.ledger_id_val,
                "party_customer_id": receipt.party_customer_id,
                "party_vendor_id": receipt.party_vendor_id
            })
            
            # Credit: Multiple Customers from Items
            # We group by customer to avoid multiple lines for the same customer in the JV
            customer_data_map = {} # Store IDs too
            for item in receipt.items.all():
                if not item.ledger_id_val: continue
                lid = item.ledger_id_val
                amt = Decimal(str(item.received_amount))
                if lid not in customer_data_map:
                    customer_data_map[lid] = {
                        "amount": Decimal("0"),
                        "c_id": item.party_customer_id,
                        "v_id": item.party_vendor_id
                    }
                customer_data_map[lid]["amount"] += amt

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
                        "customer_id": data["c_id"],
                        "vendor_id": data["v_id"]
                    })
            
            if len(entries) >= 2:
                post_transaction(
                    voucher_type="RECEIPT", 
                    voucher_id=receipt.id, 
                    tenant_id=receipt.tenant_id, 
                    entries=entries
                )
        except Exception:
            pass

    def _safe_int(self, val):
        if val is None: return None
        try:
            return int(float(str(val)))
        except:
            return None

    def _get_party_ids(self, ledger):
        if not ledger: return None, None, None
        
        # If passed as ID, resolve the object first
        if isinstance(ledger, (int, str)):
            try:
                from accounting.models import MasterLedger
                ledger = MasterLedger.objects.get(pk=ledger)
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

# --- DEPRECATED FOR BACKWARD COMPAT (Keep for migration script refs if needed) ---
class VoucherReceiptSingleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReceiptVoucher
        fields = '__all__'
class VoucherReceiptBulkSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReceiptVoucher
        fields = '__all__'
