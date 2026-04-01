import uuid
from decimal import Decimal, InvalidOperation
from rest_framework import serializers # type: ignore
from .models_voucher_receipt import ReceiptVoucher, ReceiptVoucherItem # type: ignore
from .models import MasterLedger, Voucher, JournalEntry # type: ignore
from accounting.services.ledger_service import post_transaction, _resolve_ledger
from accounting.services.sales_status_service import update_sales_invoice_payment_status

def _safe_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")

class ReceiptVoucherItemSerializer(serializers.ModelSerializer):
    customer = serializers.CharField(required=False, allow_null=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)

    class Meta:
        model = ReceiptVoucherItem
        fields = [
            'id', 'customer', 'customer_name', 'reference_id', 'reference_type', 
            'pending_transaction', 'amount', 'pending_before', 'received_amount', 
            'balance_after', 'is_advance', 'advance_ref_no'
        ]

    def validate_customer(self, value):
        request = self.context.get('request')
        tenant_id = request.user.tenant_id if request and hasattr(request.user, 'tenant_id') else None
        
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
    receive_in_name = serializers.CharField(source='receive_in.name', read_only=True)
    items = ReceiptVoucherItemSerializer(many=True, required=False)
    
    # Handle both ID and Name in POST
    receive_in = serializers.CharField(required=False, allow_null=True)
    customer = serializers.CharField(required=False, allow_null=True)
    voucher_number = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = ReceiptVoucher
        fields = '__all__'
        read_only_fields = ['tenant_id']

    def validate(self, attrs):
        request = self.context.get('request')
        tenant_id = request.user.tenant_id if request and hasattr(request.user, 'tenant_id') else None

        if 'receive_in' in attrs and not isinstance(attrs['receive_in'], MasterLedger):
            attrs['receive_in'] = _resolve_ledger(attrs['receive_in'], tenant_id)
        
        if 'customer' in attrs and attrs['customer'] and not isinstance(attrs['customer'], MasterLedger):
            ledger = _resolve_ledger(attrs['customer'], tenant_id)
            if not ledger:
                # Check Portal Customer
                from customerportal.models import CustomerMasterCustomer
                portal_cust = CustomerMasterCustomer.objects.filter(tenant_id=tenant_id, customer_name__iexact=str(attrs['customer']).strip()).first()
                if portal_cust:
                    ledger = MasterLedger.objects.filter(tenant_id=tenant_id, name__iexact=portal_cust.customer_name).first()
                    if not ledger:
                        try:
                            ledger = MasterLedger.objects.create(tenant_id=tenant_id, name=portal_cust.customer_name, group='Sundry Debtors', category='Asset')
                            portal_cust.ledger_id = ledger.id
                            portal_cust.save(update_fields=['ledger_id'])
                        except Exception:
                            ledger = MasterLedger.objects.filter(tenant_id=tenant_id, name__iexact=portal_cust.customer_name).first()
                
                if not ledger:
                    # Check Portal Vendor
                    from vendors.models import VendorMasterBasicDetail
                    portal_vend = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id, vendor_name__iexact=str(attrs['customer']).strip()).first()
                    if portal_vend:
                        ledger = MasterLedger.objects.filter(tenant_id=tenant_id, name__iexact=portal_vend.vendor_name).first()
                        if not ledger:
                            try:
                                ledger = MasterLedger.objects.create(tenant_id=tenant_id, name=portal_vend.vendor_name, group='Sundry Creditors', category='Liability')
                                portal_vend.ledger_id = ledger.id
                                portal_vend.save(update_fields=['ledger_id'])
                            except Exception:
                                ledger = MasterLedger.objects.filter(tenant_id=tenant_id, name__iexact=portal_vend.vendor_name).first()
            
            attrs['customer'] = ledger

        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        tenant_id = request.user.tenant_id if request and hasattr(request.user, 'tenant_id') else None
        
        # Ensure tenant_id is in validated_data before super().create
        validated_data['tenant_id'] = tenant_id

        items_data = validated_data.pop('items', [])
        
        # If customer is missing from master (common in bulk), pick the first customer from items
        if not validated_data.get('customer') and items_data:
            first_item_customer = items_data[0].get('customer')
            if first_item_customer:
                # The nested serializer already validated it if it was in items
                validated_data['customer'] = first_item_customer if isinstance(first_item_customer, MasterLedger) else _resolve_ledger(first_item_customer, tenant_id)
            
        if not validated_data.get('voucher_number'):
            from masters.models import MasterVoucherReceipts
            series = MasterVoucherReceipts.objects.filter(tenant_id=tenant_id, is_active=True).first()
            if series:
                validated_data['voucher_number'] = series.get_next_number()
                series.increment_number()
            else:
                # Allow custom prefix from client if needed, or default
                validated_data['voucher_number'] = f"REC-{uuid.uuid4().hex[:6].upper()}"
            
        receipt = super().create(validated_data)

        # Create child items (Customers and Allocations)
        for item_data in items_data:
            # Resolve item-level customer if it's a string from the nested serializer
            customer_data = item_data.pop('customer', None)
            if customer_data:
                item_data['customer'] = customer_data
            
            ReceiptVoucherItem.objects.create(
                voucher=receipt, 
                tenant_id=receipt.tenant_id,
                **item_data
            )
            
            # Post-save: Update Sales Invoice payment status if we have a reference_id
            if item_data.get('reference_id'):
                update_sales_invoice_payment_status(receipt.tenant_id, item_data.get('reference_id'))

        self._mirror_to_generic_voucher(receipt)
        self._mirror_to_customer_portal(receipt)
        self._mirror_to_vendor_portal(receipt)
        self._post_journal_entries(receipt)

        return receipt

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
                    "reference_id": item.reference_id,
                    "reference_type": item.reference_type,
                    "pending_transaction": item.pending_transaction,
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
                amount=receipt.total_amount,
                total=receipt.total_amount,
                source=receipt.source or 'manual',
                reference_id=receipt.id,
                items_data=items_data
            )
        except Exception as e:
            print(f"!!! Mirror Failed: {str(e)}")
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
                except Exception as e:
                    print(f"!!! Vendor Sync Error for item {item.id}: {str(e)}")
        except Exception as e:
            print(f"!!! Vendor Mirror Process Failure: {str(e)}")

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
                    print(f"!!! Mirror Failed: No customer name available for item {item.id}")
                    continue

                try:
                    # Resolve portal customer record (CustomerMasterCustomer in database.py)
                    portal_customer = CustomerMasterCustomer.objects.filter(
                        tenant_id=receipt.tenant_id, 
                        customer_name__iexact=lookup_name
                    ).first()
                    
                    if portal_customer:
                        # NEW: Selective Mirroring Logic
                        # ONLY create a portal transaction if it's an Advance or On Account payment.
                        # Normal invoice settlements should NOT create a new entry (they update the Sales row instead).
                        is_adv = (item.is_advance or item.reference_type == 'advance' or not item.reference_id)
                        if not is_adv:
                            print(f"!!! Portal Mirror Skip: {lookup_name} (Settlement row, skipping new entry)")
                            continue
                            
                        # Map transaction types to portal-specific statuses
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
                                'reference_number': item.reference_id or receipt.voucher_number,
                                'notes': receipt.notes or f"Receipt for {item.reference_id}"
                            }
                        )
                        print(f"!!! Portal Mirror OK: {lookup_name} (ID: {portal_customer.id})")
                    else:
                        print(f"!!! Portal Mirror Error: Portal customer '{lookup_name}' not found")
                except Exception as e:
                    print(f"!!! Customer Portal Sync Item Failure: {str(e)}")
        except Exception as e:
            print(f"!!! Customer Portal Mirror Process Failure: {str(e)}")

    def _post_journal_entries(self, receipt):
        """Post the double-entry transactions"""
        try:
            total_decimal = Decimal(str(receipt.total_amount))
            if total_decimal <= 0: return

            entries = []
            # Debit: Bank/Cash
            entries.append({"ledger_id": receipt.receive_in.id, "debit": float(total_decimal), "credit": 0})
            
            # Credit: Multiple Customers from Items
            # We group by customer to avoid multiple lines for the same customer in the JV
            customer_totals = {}
            for item in receipt.items.all():
                if not item.customer:
                    print(f"!!! Skipping item in Journal Entry because customer is null")
                    continue
                cid = item.customer.id
                amt = Decimal(str(item.received_amount))
                customer_totals[cid] = customer_totals.get(cid, Decimal("0")) + amt

            for cid, amt in customer_totals.items():
                if amt > 0:
                    entries.append({"ledger_id": cid, "debit": 0, "credit": float(amt)})
            
            if len(entries) >= 2:
                post_transaction(
                    voucher_type="RECEIPT", 
                    voucher_id=receipt.id, 
                    tenant_id=receipt.tenant_id, 
                    entries=entries
                )
        except Exception as e:
            print(f"Error posting journal entry: {str(e)}")

# --- DEPRECATED FOR BACKWARD COMPAT (Keep for migration script refs if needed) ---
class VoucherReceiptSingleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReceiptVoucher
        fields = '__all__'
class VoucherReceiptBulkSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReceiptVoucher
        fields = '__all__'
