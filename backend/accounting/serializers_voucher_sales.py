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
    
    def validate_sales_invoice_no(self, value):
        """
        Ensures the invoice number is unique within the tenant.
        """
        request = self.context.get('request')
        tenant_id = self.context.get('tenant_id')
        if not tenant_id and request:
            tenant_id = getattr(request.user, 'tenant_id', 1)
        
        if not tenant_id:
            return value

        if value:
            qs = VoucherSalesInvoiceDetails.objects.filter(
                tenant_id=tenant_id,
                sales_invoice_no__iexact=value.strip()
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            
            if qs.exists():
                existing = qs.first()
                raise serializers.ValidationError(f"Invoice number '{value}' already exists for customer '{existing.customer_name}'.")
        
        return value
    
    def _sync_numbering_series(self, tenant_id, voucher_name, sales_invoice_no):
        """
        Ensures that the Master numbering series is ahead of any manually provided invoice number.
        Useful for syncing after Excel uploads.
        """
        from masters.models import MasterVoucherSales
        import re
        try:
            series = MasterVoucherSales.objects.filter(
                tenant_id=tenant_id, 
                voucher_name=voucher_name,
                enable_auto_numbering=True
            ).first()
            if not series:
                return

            next_num = (series.current_number or series.start_from or 1)
            
            if sales_invoice_no:
                clean_no = str(sales_invoice_no)
                if series.prefix and clean_no.startswith(series.prefix):
                    clean_no = clean_no[len(series.prefix):]
                if series.suffix and clean_no.endswith(series.suffix):
                    clean_no = clean_no[:-len(series.suffix)]
                
                # Extract numeric part (handles cases like INV000172 -> 172)
                match = re.search(r'(\d+)', clean_no)
                if match:
                    num_str = match.group(1)
                    extracted_num = int(num_str)
                    
                    # Typo protection: ignore abnormally long numbers
                    required_digits = series.required_digits or 4
                    if len(num_str) <= required_digits + 2:
                        next_num = max(next_num, extracted_num + 1)
                    else:
                        print(f"[SalesSerializer] Ignoring suspicious outlier: {num_str}")
            
            series.current_number = next_num
            series.save(update_fields=['current_number', 'updated_at'])
            print(f"[SalesSerializer] Series '{voucher_name}' sync: current_number set to {next_num}")
        except Exception as e:
            print(f"[SalesSerializer] Failed to sync numbering series: {e}")

    def _get_next_number_from_series(self, tenant_id, voucher_name):
        from masters.models import MasterVoucherSales
        try:
            series = MasterVoucherSales.objects.filter(
                tenant_id=tenant_id, 
                voucher_name=voucher_name,
                is_active=True
            ).first()
            if not series:
                return None
            
            num = series.current_number or series.start_from or 1
            digits = series.required_digits or 4
            prefix = series.prefix or ''
            suffix = series.suffix or ''
            
            formatted = f"{prefix}{str(num).zfill(digits)}{suffix}"
            
            # Increment the counter
            series.current_number = num + 1
            series.save(update_fields=['current_number', 'updated_at'])
            
            return formatted
        except Exception as e:
            print(f"[SalesSerializer] Auto-number failed: {e}")
            return None

    def create(self, validated_data):
        # Part 2: Debug Incoming Data
        print("DEBUG VALIDATED_DATA:", validated_data)

        # 0. Sync Numbering Series
        voucher_name = validated_data.get('voucher_name')
        sales_invoice_no = validated_data.get('sales_invoice_no')
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        tenant_id = getattr(user, 'tenant_id', None)
        
        if voucher_name and tenant_id:
            if not sales_invoice_no:
                # If number is missing (e.g. Excel upload), generate it from series
                generated_no = self._get_next_number_from_series(tenant_id, voucher_name)
                if generated_no:
                    validated_data['sales_invoice_no'] = generated_no
                    print(f"[SalesSerializer] Auto-generated invoice number: {generated_no}")
            else:
                # If number is provided, ensure the series counter is ahead of it
                self._sync_numbering_series(tenant_id, voucher_name, sales_invoice_no)

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
        """Internal helper to post double-entry bookkeeping for the invoice with individual GST detail rows"""
        try:
            from accounting.services.ledger_service import post_transaction
            from accounting.utils_ledger import get_standard_ledger
            from accounting.models import JournalEntry
            from decimal import Decimal as D

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
            gst_output_ledger = get_standard_ledger(tenant_id, 'Output Tax Liability Ledger', 'Duties & Taxes', 'Liability')

            # Resolve Customer TCS/TDS Ledger and Amount
            tcs_amt = float(payment_obj.payment_tds_income_tax or 0)
            
            # Customer owes us the full Invoice Total PLUS any TCS collected from them
            customer_debit_amt = total_amount + tcs_amt

            entries = []
            if customer.ledger_id:
                entries.append({"ledger_id": customer.ledger_id, "debit": customer_debit_amt, "credit": 0})
            else:
                print(f"[SalesSerializer] Posting Error: Customer {customer.name} has no ledger mapping.")
                return

            # TCS/TDS (Credit - we owe govt)
            tcs_master_ledger = None
            tcs_section_name = "Unspecified Section"
            if tcs_amt > 0:
                tcs_master_ledger = get_standard_ledger(tenant_id, 'TCS Payable', 'Duties & Taxes', 'Liability')
                entries.append({"ledger_id": tcs_master_ledger.id, "debit": 0, "credit": tcs_amt})
                
                # Try to resolve the specific section name for supplementary rows
                if invoice.customer_id:
                    try:
                        from customerportal.database import CustomerMasterCustomerTDS
                        tds_obj = CustomerMasterCustomerTDS.objects.filter(
                            customer_basic_detail_id=invoice.customer_id
                        ).first()
                        if tds_obj:
                            if tds_obj.tcs_enabled and tds_obj.tcs_section:
                                tcs_section_name = tds_obj.tcs_section.strip()
                            elif tds_obj.tds_enabled and tds_obj.tds_section:
                                tcs_section_name = tds_obj.tds_section.strip()
                    except Exception:
                        pass

            # Sales (Credit - Taxable Value)
            entries.append({"ledger_id": sales_ledger.id, "debit": 0, "credit": float(payment_obj.payment_taxable_value or 0)})

            # Collect individual GST amounts
            igst_amt = float(payment_obj.payment_igst or 0)
            cgst_amt = float(payment_obj.payment_cgst or 0)
            sgst_amt = float(payment_obj.payment_sgst or 0)
            cess_amt = float(payment_obj.payment_cess or 0)
            state_cess_amt = float(payment_obj.payment_state_cess or 0)
            total_tax = igst_amt + cgst_amt + sgst_amt + cess_amt + state_cess_amt

            # Taxes — single aggregated credit to Output Tax Liability Ledger
            if total_tax > 0:
                entries.append({"ledger_id": gst_output_ledger.id, "debit": 0, "credit": total_tax})

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

            # Write supplementary GST detail rows for the Output Tax Liability Ledger drill-down
            if total_tax > 0:
                gst_detail_type = "SALES_GST_DETAIL"
                JournalEntry.objects.filter(
                    tenant_id=tenant_id,
                    voucher_type=gst_detail_type,
                    voucher_id=v_id
                ).delete()

                detail_rows = []
                component_map = [
                    ("IGST", igst_amt),
                    ("CGST", cgst_amt),
                    ("SGST/UTGST", sgst_amt),
                    ("Cess", cess_amt),
                    ("State Cess", state_cess_amt),
                ]
                for component_name, component_amt in component_map:
                    if component_amt > 0:
                        detail_rows.append(JournalEntry(
                            tenant_id=tenant_id,
                            voucher_type=gst_detail_type,
                            voucher_id=v_id,
                            voucher_number=invoice.sales_invoice_no,
                            transaction_date=invoice.date,
                            ledger_id=gst_output_ledger.id,
                            ledger_name=f"Output Tax Liability Ledger ({component_name})",
                            ledger_id_val=gst_output_ledger.id,
                            debit=D('0.00'),
                            credit=D(str(component_amt)),
                        ))
                if detail_rows:
                    JournalEntry.objects.bulk_create(detail_rows)

            # Write supplementary TCS detail rows for drill-down breakdown
            if tcs_amt > 0 and tcs_master_ledger:
                tcs_detail_type = "SALES_TCS_DETAIL"
                JournalEntry.objects.filter(
                    tenant_id=tenant_id,
                    voucher_type=tcs_detail_type,
                    voucher_id=v_id
                ).delete()
                
                JournalEntry.objects.create(
                    tenant_id=tenant_id,
                    voucher_type=tcs_detail_type,
                    voucher_id=v_id,
                    voucher_number=invoice.sales_invoice_no,
                    transaction_date=invoice.date,
                    ledger_id=tcs_master_ledger.id,
                    ledger_name=f"TCS Payable ({tcs_section_name})",
                    ledger_id_val=tcs_master_ledger.id,
                    debit=D('0.00'),
                    credit=D(str(tcs_amt)),
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


