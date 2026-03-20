from rest_framework import serializers
from django.db import transaction
from .models_voucher_sales import (
    VoucherSalesInvoiceDetails, VoucherSalesItems, VoucherSalesItemsForeign,
    VoucherSalesPaymentDetails, VoucherSalesDispatchDetails,
    VoucherSalesEwayBill
)
from core.utils import TenantModelSerializerMixin
from accounting.services.ledger_service import post_transaction
from accounting.utils_ledger import get_standard_ledger
from customerportal.database import CustomerMasterCustomerBasicDetails
from .models import Voucher

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
    class Meta:
        model = VoucherSalesPaymentDetails
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at')

class VoucherSalesDispatchDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherSalesDispatchDetails
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at')

class VoucherSalesEwayBillSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherSalesEwayBill
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at') 

class VoucherSalesInvoiceDetailsSerializer(TenantModelSerializerMixin, serializers.ModelSerializer):
    items = VoucherSalesItemsSerializer(many=True, required=False)
    foreign_items = VoucherSalesItemsForeignSerializer(many=True, required=False)
    payment_details = VoucherSalesPaymentDetailsSerializer(required=False)
    dispatch_details = VoucherSalesDispatchDetailsSerializer(required=False)
    eway_bill_details = VoucherSalesEwayBillSerializer(many=True, required=False) 

    class Meta:
        model = VoucherSalesInvoiceDetails
        fields = [
            'id', 'tenant_id', 'date', 'sales_invoice_no', 'voucher_name', 'outward_slip_no',
            'customer_name', 'customer_id', 'customer_branch', 'bill_to', 'ship_to', 'gstin', 'contact',
            'tax_type', 'state_type', 'export_type', 'exchange_rate', 'supporting_document',
            'sales_order_no', 'place_of_supply', 'reverse_charge', 'invoice_type',
            'gst_export_type', 'port_code', 'shipping_bill_number', 'shipping_bill_date',
            'ecommerce_gstin', 'irn', 'ack_no', 'created_at', 'updated_at',
            'posting_status', 'posting_error',
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
            
            # Create Items
            for item in items_data:
                VoucherSalesItems.objects.create(invoice=invoice, tenant_id=tenant_id, **item)
            
            # Create Foreign Items
            for item in foreign_items_data:
                VoucherSalesItemsForeign.objects.create(invoice=invoice, tenant_id=tenant_id, **item)
            
            # Create Payment Details
            payment_obj = None
            if payment_data:
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

        print(f"Voucher {invoice.sales_invoice_no} saved successfully (ID: {invoice.id})")

        # ACCOUNTING POSTING (OUTSIDE atomic transaction)
        if payment_obj:
            try:
                # Part 2: Introduce Posting Control Logic
                total_amount = float(payment_obj.payment_invoice_value or 0)
                is_zero_invoice = total_amount == 0

                if is_zero_invoice:
                    print("Accounting skipped (zero invoice)")
                    invoice.posting_status = "SKIPPED"
                    invoice.save(update_fields=['posting_status'])
                    return invoice

                # Build Entries
                customer = CustomerMasterCustomerBasicDetails.objects.get(
                    id=customer_id, 
                    tenant_id=tenant_id
                )
                
                sales_ledger = get_standard_ledger(tenant_id, 'Sales Account', 'Sales Accounts', 'Income')
                gst_output_ledger = get_standard_ledger(tenant_id, 'Output GST', 'Duties & Taxes', 'Liability')

                entries = []

                # Mandatory Entry: Customer (Debit)
                entries.append({
                    "ledger_id": customer.ledger_id,
                    "debit": total_amount,
                    "credit": 0
                })

                # Mandatory Entry: Sales (Credit)
                entries.append({
                    "ledger_id": sales_ledger.id,
                    "debit": 0,
                    "credit": float(payment_obj.payment_taxable_value or 0)
                })

                # Optional Tax Entries
                taxes = [
                    (payment_obj.payment_igst, 'IGST'),
                    (payment_obj.payment_cgst, 'CGST'),
                    (payment_obj.payment_sgst, 'SGST'),
                    (payment_obj.payment_cess, 'CESS'),
                    (payment_obj.payment_state_cess, 'State Cess')
                ]

                for tax_val, _ in taxes:
                    if tax_val and float(tax_val) > 0:
                        entries.append({
                            "ledger_id": gst_output_ledger.id,
                            "debit": 0,
                            "credit": float(tax_val)
                        })

                # Filter Zero Entries
                entries = [e for e in entries if e["debit"] > 0 or e["credit"] > 0]

                # Part 3: Validate Entries Before Posting
                has_debit = any(e["debit"] > 0 for e in entries)
                has_credit = any(e["credit"] > 0 for e in entries)

                if len(entries) < 2 or not has_debit or not has_credit:
                    print(f"Accounting skipped: Invalid entries count ({len(entries)}) or missing Dr/Cr")
                    invoice.posting_status = "SKIPPED"
                    invoice.posting_error = "Insufficient valid entries for posting (less than 2 or missing Dr/Cr)"
                    invoice.save(update_fields=['posting_status', 'posting_error'])
                    return invoice

                total_debit = sum(e["debit"] for e in entries)
                total_credit = sum(e["credit"] for e in entries)

                if abs(total_debit - total_credit) > 0.01:
                    print(f"WARNING: Debit/Credit mismatch! Diff: {total_debit - total_credit}")
                    # We still try to post, or we could mark as FAILED. 
                    # For strictness, let's let post_transaction handle the mismatch throw if it's too large.

                print("FINAL ENTRIES:", entries)

                # Part 4 & 5: Posting Status Tracking & Error Handling
                post_transaction(
                    voucher_type="SALES",
                    voucher_id=voucher.id,
                    tenant_id=tenant_id,
                    entries=entries
                )
                
                print("Accounting posted successfully")
                invoice.posting_status = "POSTED"
                invoice.save(update_fields=['posting_status'])
                
            except Exception as e:
                print(f"ACCOUNTING POSTING FAILED: {str(e)}")
                invoice.posting_status = "FAILED"
                invoice.posting_error = str(e)
                invoice.save(update_fields=['posting_status', 'posting_error'])
                # DO NOT RE-RAISE. We want the voucher saved.
        else:
            print("Accounting skipped (no payment details)")
            invoice.posting_status = "SKIPPED"
            invoice.save(update_fields=['posting_status'])

        return invoice

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

        return instance
