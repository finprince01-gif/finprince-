from rest_framework import serializers  # type: ignore
from django.db import transaction  # type: ignore
from .models_voucher_sales import (
    VoucherSalesInvoiceDetails, VoucherSalesItems, VoucherSalesItemsForeign,
    VoucherSalesPaymentDetails, VoucherSalesDispatchDetails,
    VoucherSalesEwayBill
)
from core.mixins import BranchModelSerializerMixin
from accounting.services.ledger_service import post_transaction
from accounting.utils_ledger import get_standard_ledger
from customerportal.database import CustomerMasterCustomerBasicDetails
from .models import Voucher
from inventory.models import InventoryOperationOutward
import json
import decimal

class VoucherSalesItemsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherSalesItems
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at')

class VoucherSalesItemsForeignSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherSalesItemsForeign
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at')

class VoucherSalesPaymentDetailsSerializer(serializers.ModelSerializer):
    advance_references = serializers.JSONField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = VoucherSalesPaymentDetails
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at', 'payment_received', 'payment_balance')

class VoucherSalesDispatchDetailsSerializer(serializers.ModelSerializer):
    dispatch_document = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = VoucherSalesDispatchDetails
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at')

class VoucherSalesEwayBillSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherSalesEwayBill
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at') 

class VoucherSalesInvoiceDetailsSerializer(BranchModelSerializerMixin, serializers.ModelSerializer):
    items = VoucherSalesItemsSerializer(many=True, required=False)
    foreign_items = VoucherSalesItemsForeignSerializer(many=True, required=False)
    payment_details = VoucherSalesPaymentDetailsSerializer(required=False)
    dispatch_details = VoucherSalesDispatchDetailsSerializer(required=False)
    eway_bill_details = VoucherSalesEwayBillSerializer(many=True, required=False) 
    
    # Explicitly define to avoid "Not a valid string" error from ChoiceField/other weirdness
    reverse_charge = serializers.CharField(required=False, default='N', max_length=1)
    supporting_document = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = VoucherSalesInvoiceDetails
        fields = [
            'id', 'tenant_id', 'date', 'sales_invoice_no', 'voucher_name', 'outward_slip_no',
            'customer_name', 'customer_id', 'customer_branch', 'bill_to', 'ship_to', 'gstin', 'contact',
            'tax_type', 'state_type', 'export_type', 'exchange_rate', 'supporting_document',
            'sales_order_no', 'place_of_supply', 'reverse_charge', 'invoice_type',
            'gst_export_type', 'port_code', 'shipping_bill_number', 'shipping_bill_date',
            'ecommerce_gstin', 'irn', 'ack_no', 'created_at', 'updated_at',
            'posting_status', 'posting_error', 'outward_slip_id', 'status',
            # Nested Fields
            'items', 'foreign_items', 'payment_details', 'dispatch_details', 'eway_bill_details'
        ]
        read_only_fields = ('id', 'tenant_id', 'created_at', 'updated_at', 'posting_status', 'posting_error')

    def create(self, validated_data):
        # Part 2: Debug Incoming Data
        print("DEBUG VALIDATED_DATA:", validated_data)

        # Part 1: Validate Input (MANDATORY)
        customer_id = validated_data.get("customer_id")
        if not customer_id:
            raise serializers.ValidationError({"customer_id": "customer_id is required"})

        items_data = validated_data.pop('items', [])
        foreign_items_data = validated_data.pop('foreign_items', [])
        payment_data = validated_data.pop('payment_details', None)
        dispatch_data = validated_data.pop('dispatch_details', None)
        eway_bill_details_data = validated_data.pop('eway_bill_details', [])
        
        # Part 5: Wrap in Transaction
        with transaction.atomic():
            # Create Invoice header
            invoice = super().create(validated_data)
            tenant_id = invoice.tenant_id

            # NEW: Link and Mark Outward Slip as USED
            outward_slip_id = validated_data.get('outward_slip_id')
            if outward_slip_id:
                try:
                    outward_slip = InventoryOperationOutward.objects.get(id=outward_slip_id, tenant_id=tenant_id)
                    if outward_slip.status == 'USED':
                         raise serializers.ValidationError({"outward_slip_id": "This outward slip has already been used in another invoice."})
                    
                    outward_slip.status = 'USED'
                    outward_slip.linked_sales_voucher_id = invoice.id
                    outward_slip.save(update_fields=['status', 'linked_sales_voucher_id'])
                except InventoryOperationOutward.DoesNotExist:
                    raise serializers.ValidationError({"outward_slip_id": "Invalid outward slip ID."})
            
            # Create Items
            for item in items_data:
                VoucherSalesItems.objects.create(invoice=invoice, tenant_id=tenant_id, **item)
            
            # Create Foreign Items
            for item in foreign_items_data:
                VoucherSalesItemsForeign.objects.create(invoice=invoice, tenant_id=tenant_id, **item)
            
            # Create Payment Details
            payment_obj = None
            adv_refs = None
            if payment_data:
                adv_refs = payment_data.pop('advance_references', None)
                payment_obj = VoucherSalesPaymentDetails.objects.create(invoice=invoice, tenant_id=tenant_id, **payment_data)
                
            # Create Dispatch Details
            if dispatch_data:
                VoucherSalesDispatchDetails.objects.create(invoice=invoice, tenant_id=tenant_id, **dispatch_data)
                
            # Create Eway Bill Details
            for eway_data in eway_bill_details_data:
                VoucherSalesEwayBill.objects.create(invoice=invoice, tenant_id=tenant_id, **eway_data)

            voucher = Voucher.objects.create(
                tenant_id=tenant_id,
                type="sales",
                voucher_number=invoice.sales_invoice_no or f"SAL-{invoice.id}",
                date=invoice.date,
                party=invoice.customer_name,
                total=payment_obj.payment_invoice_value if payment_obj else 0,
                invoice_no=invoice.sales_invoice_no,
                source="sales_invoice",
                reference_id=invoice.id
            )

            invoice.voucher_id = voucher.id
            invoice.save(update_fields=['voucher_id'])

            # --- Record Advance Allocation Maps (Phase 4C) ---
            if adv_refs:
                from django.db.models import Q  # type: ignore
                from accounting.services.advance_service import write_allocations
                try:
                    # Parse if string, or use as-is if already list/dict
                    if isinstance(adv_refs, str):
                        import json
                        adv_refs = json.loads(adv_refs)
                    
                    if adv_refs:
                        write_allocations(
                            tenant_id=tenant_id,
                            voucher_id=voucher.id,
                            voucher_type='sales',
                            advance_refs=adv_refs,
                            ledger_id=invoice.customer_id
                        )
                except Exception as ex:
                    print(f"[SalesSerializer] Advance allocation failed: {ex}")


        self._mirror_to_customer_portal(invoice)
        print(f"Voucher {invoice.sales_invoice_no} saved successfully (ID: {invoice.id})")

        # --- Double-Entry Posting for Sales (entries table) ---
        self._post_journal_entries(invoice)

        return invoice

    def _post_journal_entries(self, invoice):
        """Unified double-entry posting for sales invoice."""
        try:
            tenant_id = invoice.tenant_id
            payment_obj = invoice.payment_details
            if not payment_obj: 
                print("Accounting skipped (no payment details)")
                return

            total_amount = float(payment_obj.payment_invoice_value or 0)
            if total_amount == 0:
                print("Accounting skipped (zero invoice)")
                return

            customer = invoice.customer
            sales_ledger = get_standard_ledger(tenant_id, 'Sales Account', 'Sales Accounts', 'Income')
            gst_output_ledger = get_standard_ledger(tenant_id, 'Output GST', 'Duties & Taxes', 'Liability')

            entries = []
            # Customer (Debit)
            entries.append({"ledger_id": customer.ledger_id, "debit": total_amount, "credit": 0})
            
            # Sales (Credit)
            entries.append({"ledger_id": sales_ledger.id, "debit": 0, "credit": float(payment_obj.payment_taxable_value or 0)})

            # Taxes
            taxes = [
                payment_obj.payment_igst, payment_obj.payment_cgst, payment_obj.payment_sgst, 
                payment_obj.payment_cess, payment_obj.payment_state_cess
            ]
            for tax_val in taxes:
                if tax_val and float(tax_val) > 0:
                    entries.append({"ledger_id": gst_output_ledger.id, "debit": 0, "credit": float(tax_val)})

            # Use generic voucher ID if present
            v_id = getattr(invoice, 'voucher_id', None) or invoice.id
            post_transaction(
                voucher_type="SALES",
                voucher_id=v_id,
                tenant_id=tenant_id,
                entries=entries,
                transaction_date=invoice.date,
                voucher_number=invoice.sales_invoice_no
            )
            print("Accounting posted successfully")
            invoice.posting_status = "POSTED"
            invoice.save(update_fields=['posting_status'])
        except Exception as e:
            print(f"ACCOUNTING POSTING FAILED: {str(e)}")
            invoice.posting_status = "FAILED"
            invoice.posting_error = str(e)
            if invoice.id:
                invoice.save(update_fields=['posting_status', 'posting_error'])

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        foreign_items_data = validated_data.pop('foreign_items', None)
        payment_data = validated_data.pop('payment_details', None)
        dispatch_data = validated_data.pop('dispatch_details', None)
        eway_bill_details_data = validated_data.pop('eway_bill_details', None)

        # Update Invoice Header
        instance = super().update(instance, validated_data)
        tenant_id = instance.tenant_id

        # Update Items
        if items_data is not None:
            instance.items.all().delete()
            for item in items_data:
                VoucherSalesItems.objects.create(invoice=instance, tenant_id=tenant_id, **item)
        
        # Update Foreign Items
        if foreign_items_data is not None:
            instance.foreign_items.all().delete()
            for item in foreign_items_data:
                VoucherSalesItemsForeign.objects.create(invoice=instance, tenant_id=tenant_id, **item)

        # Update Payment Details
        if payment_data:
            VoucherSalesPaymentDetails.objects.update_or_create(
                invoice=instance, 
                defaults={**payment_data, 'tenant_id': tenant_id}
            )

        # Update Dispatch Details
        if dispatch_data:
            VoucherSalesDispatchDetails.objects.update_or_create(
                invoice=instance, 
                defaults={**dispatch_data, 'tenant_id': tenant_id}
            )

        # Update Eway Bill Details
        if eway_bill_details_data is not None:
            instance.eway_bill_details.all().delete()
            for eway_data in eway_bill_details_data:
                VoucherSalesEwayBill.objects.create(invoice=instance, tenant_id=tenant_id, **eway_data)

        # --- Record Advance Allocation Maps Update (Phase 4C) ---
        if instance.voucher_id:
            from accounting.models_voucher_sales import VoucherSalesPaymentDetails
            payment_obj = VoucherSalesPaymentDetails.objects.filter(invoice=instance).first()
            if payment_obj and payment_obj.advance_references:
                from accounting.services.advance_service import write_allocations
                try:
                    adv_refs = payment_obj.advance_references
                    if isinstance(adv_refs, str):
                        import json
                        adv_refs = json.loads(adv_refs)
                    
                    if adv_refs:
                        write_allocations(
                            tenant_id=tenant_id,
                            voucher_id=instance.voucher_id,
                            voucher_type='sales',
                            advance_refs=adv_refs,
                            ledger_id=instance.customer_id
                        )
                except Exception as ex:
                    print(f"[SalesSerializer] Advance allocation update failed: {ex}")

        self._mirror_to_customer_portal(instance)
        
        # Refresh double-entry posting
        self._post_journal_entries(instance)

        return instance

    def _mirror_to_customer_portal(self, invoice):
        """Cross-database sync to Customer Portal table (customer_transaction)"""
        try:
            from customerportal.models import CustomerTransaction, CustomerMasterCustomer
            
            # 1. Resolve portal customer record (By ID first, then fallback to Name)
            portal_customer = None
            if invoice.customer_id:
                portal_customer = CustomerMasterCustomer.objects.filter(
                    tenant_id=invoice.tenant_id, 
                    id=invoice.customer_id
                ).first()
            
            if not portal_customer and invoice.customer_name:
                portal_customer = CustomerMasterCustomer.objects.filter(
                    tenant_id=invoice.tenant_id, 
                    customer_name__iexact=str(invoice.customer_name).strip()
                ).first()
            
            if not portal_customer:
                print(f"!!! Portal Mirror Error: Portal customer '{invoice.customer_name}' (ID: {invoice.customer_id}) not found")
                return

            payment_details = invoice.payment_details if hasattr(invoice, 'payment_details') else None
            total_invoice_val = payment_details.payment_invoice_value if payment_details else 0
            
            # 2. Mirror Advance Adjustments only
            # The Invoice itself is already fetched from the main Sales table by the portal UI,
            # so we only mirror the advance adjustments to the customer_transaction table.
            
            if payment_details and payment_details.payment_advance and float(payment_details.payment_advance) > 0:
                # Idempotency: Remove existing mirrored advance adjustments for this invoice
                # These are identified by the '-ADJ{id}I' suffix in transaction_number
                CustomerTransaction.objects.filter(
                    tenant_id=invoice.tenant_id,
                    customer_id=portal_customer.id,
                    transaction_type='RECEIPT',
                    transaction_number__contains=f"-ADJ{invoice.id}I"
                ).delete()

                # We record the adjustment as a 'receipt' or 'payment' type transaction linked to the same invoice reference
                # This ensures it shows up in the allocation view under this invoice
                
                adv_refs_str = payment_details.advance_references
                adv_refs = []
                if adv_refs_str:
                    try:
                        if isinstance(adv_refs_str, str):
                            adv_refs = json.loads(adv_refs_str)
                        else:
                            adv_refs = adv_refs_str
                    except:
                        pass
                
                # If we have multiple advance references, we could create one entry per reference or one total
                # The user specifically mentioned fetching the Reference No.
                
                if adv_refs and isinstance(adv_refs, list):
                    for idx, ref in enumerate(adv_refs):
                        # Filter strictly by 'appliedNow' flag found in the voucher data
                        is_selected = ref.get('appliedNow') is True or ref.get('selected') is True
                        allocated_amt = ref.get('amount') or ref.get('allocated_amount') or 0
                        
                        if is_selected and float(allocated_amt) > 0:
                            ref_no = ref.get('refNo') or ref.get('reference_no') or 'Advance'
                            
                            # We use a naming convention that the portal UI can trim to show the original ref_no
                            # Convention: {RefNo}-ADJ{InvoiceID}I{Index}
                            display_ref = f"{ref_no}-ADJ{invoice.id}I{idx}"
                            
                            CustomerTransaction.objects.update_or_create(
                                tenant_id=invoice.tenant_id,
                                customer_id=portal_customer.id,
                                transaction_number=display_ref,
                                transaction_type='RECEIPT', # Consistent with receipt mirroring
                                defaults={
                                    'transaction_date': invoice.date,
                                    'amount': allocated_amt,
                                    'total_amount': allocated_amt,
                                    'payment_status': 'Advance Applied',
                                    'reference_number': invoice.sales_invoice_no, # Group with this invoice
                                    'notes': f"Advance adjusted from Ref: {ref_no}"
                                }
                            )
                else:
                    # Fallback to single entry if no detailed refs but total amount exists
                    CustomerTransaction.objects.update_or_create(
                        tenant_id=invoice.tenant_id,
                        customer_id=portal_customer.id,
                        transaction_number=f"ADJ-{invoice.sales_invoice_no}",
                        transaction_type='RECEIPT',
                        defaults={
                            'transaction_date': invoice.date,
                            'amount': payment_details.payment_advance,
                            'total_amount': payment_details.payment_advance,
                            'payment_status': 'Advance Applied',
                            'reference_number': invoice.sales_invoice_no,
                            'notes': "Advance adjusted"
                        }
                    )

            print(f"!!! Portal Mirror Sales OK: {invoice.sales_invoice_no}")
        except Exception as e:
            print(f"!!! Portal Mirror Sales Failed: {str(e)}")
            pass
