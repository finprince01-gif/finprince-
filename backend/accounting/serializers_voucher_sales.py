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
            # Nested Fields
            'items', 'foreign_items', 'payment_details', 'dispatch_details', 'eway_bill_details'
        ]
        read_only_fields = ('id', 'tenant_id', 'created_at', 'updated_at')

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

            # ACCOUNTING POSTING
            if payment_obj:
                try:
                    # Part 3 & 4: Fix Customer Fetch & Correct Execution Order
                    # We use customer_id from validated_data
                    customer = CustomerMasterCustomerBasicDetails.objects.get(
                        id=customer_id, 
                        tenant_id=tenant_id
                    )
                    
                    # Part 6: Validation (Customer exists check already done)
                    
                    # 1. Mandatory Ledgers
                    sales_ledger = get_standard_ledger(tenant_id, 'Sales Account', 'Sales Accounts', 'Income')
                    gst_output_ledger = get_standard_ledger(tenant_id, 'Output GST', 'Duties & Taxes', 'Liability')

                    # 2. Build Entries (Part 1, 2, 3 from previous request)
                    entries = []

                    # Mandatory Entry: Customer (Debit)
                    entries.append({
                        "ledger_id": customer.ledger_id,
                        "debit": float(payment_obj.payment_invoice_value or 0),
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

                    # Part 4: Final Validation & Filter Zero Entries
                    entries = [e for e in entries if e["debit"] > 0 or e["credit"] > 0]

                    total_debit = sum(e["debit"] for e in entries)
                    total_credit = sum(e["credit"] for e in entries)

                    if abs(total_debit - total_credit) > 0.01:
                        print(f"WARNING: Debit/Credit mismatch! Diff: {total_debit - total_credit}")

                    # Part 5: Debug
                    print("FINAL ENTRIES:", entries)

                    # Part 2 & 3: Use voucher.id for Posting
                    post_transaction(
                        voucher_type="SALES",
                        voucher_id=voucher.id,
                        tenant_id=tenant_id,
                        entries=entries
                    )
                except Exception as e:
                    print(f"FAILED TO POST ACCOUNTING: {str(e)}")
                    # Re-raise to trigger transaction.atomic() rollback
                    raise e

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
