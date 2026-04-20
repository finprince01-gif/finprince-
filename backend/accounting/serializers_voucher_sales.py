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
import decimal
from accounting.services.inventory_sync import sync_sales_to_outward
from .services.portal_mirror_service import mirror_sales_to_portal


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

    def validate(self, data):
        """Round all decimal fields to 2 decimal places to prevent validation errors."""
        from decimal import Decimal, ROUND_HALF_UP
        for field, value in data.items():
            if isinstance(value, Decimal):
                data[field] = value.quantize(Decimal('0.00'), rounding=ROUND_HALF_UP)
        return data

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
                # Keep advance_references in payment_data so it's saved in create()
                adv_refs = payment_data.get('advance_references')
                payment_obj = VoucherSalesPaymentDetails.objects.create(invoice=invoice, tenant_id=tenant_id, **payment_data)
                
            # Create Dispatch Details
            if dispatch_data:
                VoucherSalesDispatchDetails.objects.create(invoice=invoice, tenant_id=tenant_id, **dispatch_data)
                
            # Create Eway Bill Details
            for eway_data in eway_bill_details_data:
                VoucherSalesEwayBill.objects.create(invoice=invoice, tenant_id=tenant_id, **eway_data)

            # Round total to 2 decimal places
            final_total = decimal.Decimal(str(payment_obj.payment_invoice_value if payment_obj else 0)).quantize(
                decimal.Decimal('0.00'), rounding=decimal.ROUND_HALF_UP
            )

            voucher = Voucher.objects.create(
                tenant_id=tenant_id,
                type="sales",
                voucher_number=invoice.sales_invoice_no or f"SAL-{invoice.id}",
                date=invoice.date,
                party=invoice.customer_name,
                total=final_total,
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

        mirror_sales_to_portal(invoice)

        # Auto-sync to Inventory > Operations > Outward Slip
        sync_sales_to_outward(invoice)
        print(f"Voucher {invoice.sales_invoice_no} saved successfully (ID: {invoice.id})")

        # --- Double-Entry Posting for Sales (entries table) ---
        self._post_journal_entries(invoice)

        # Recalculate status centrally
        try:
            from .services.sales_status_service import update_sales_invoice_payment_status
            update_sales_invoice_payment_status(tenant_id, str(invoice.id))
        except Exception as e:
            print(f"!!! Status Sync Error in Create: {str(e)}")

        return invoice

    def _post_journal_entries(self, invoice):
        """Internal helper to post double-entry bookkeeping for the invoice"""
        try:
            from accounting.services.ledger_service import post_transaction
            from accounting.utils_ledger import get_standard_ledger
            
            tenant_id = self.context.get('request').user.tenant_id
            payment_obj = getattr(invoice, 'payment_details', None)
            if not payment_obj:
                print("[SalesSerializer] Skipped posting: No payment details found on instance")
                return

            total_amount = float(payment_obj.payment_invoice_value or 0)
            if total_amount == 0:
                print("[SalesSerializer] Skipped posting: Zero amount")
                return

            from customerportal.database import CustomerMasterCustomer
            customer = CustomerMasterCustomer.objects.filter(id=invoice.customer_id).first()
            if not customer:
                 print(f"[SalesSerializer] Posting Error: Customer {invoice.customer_id} not found.")
                 return

            sales_ledger = get_standard_ledger(tenant_id, 'Sales Account', 'Sales Accounts', 'Income')
            gst_output_ledger = get_standard_ledger(tenant_id, 'Output GST', 'Duties & Taxes', 'Liability')

            entries = []
            if customer.ledger_id:
                entries.append({"ledger_id": customer.ledger_id, "debit": total_amount, "credit": 0})
            else:
                print(f"[SalesSerializer] Posting Error: Customer {customer.name} has no ledger mapping.")
                return
            
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

            # Resolve Voucher ID
            v_id = getattr(invoice, 'voucher_id', None) or invoice.id
            
            # Post
            post_transaction(
                voucher_type="SALES",
                voucher_id=v_id,
                tenant_id=tenant_id,
                transaction_date=invoice.date,
                voucher_number=invoice.sales_invoice_no,
                entries=entries
            )
            
            invoice.posting_status = 'POSTED'
            invoice.posting_error = None
            invoice.save()
            print(f"[SalesSerializer] Double-entry posted for {invoice.sales_invoice_no}")

        except Exception as e:
            print(f"[SalesSerializer] CRITICAL POSTING ERROR: {e}")
            invoice.posting_status = 'FAILED'
            invoice.posting_error = str(e)
            try:
                invoice.save()
            except: pass

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

        mirror_sales_to_portal(instance)

        
        # Refresh double-entry posting
        self._post_journal_entries(instance)

        # Recalculate status centrally
        try:
            from .services.sales_status_service import update_sales_invoice_payment_status
            update_sales_invoice_payment_status(instance.tenant_id, str(instance.id))
        except Exception as e:
            print(f"!!! Status Sync Error in Update: {str(e)}")

        return instance


