from rest_framework import serializers
from .models_voucher_sales import (
    VoucherSalesInvoiceDetails, VoucherSalesItems, VoucherSalesItemsForeign,
    VoucherSalesPaymentDetails, VoucherSalesDispatchDetails,
    VoucherSalesEwayBill
)
from core.utils import TenantModelSerializerMixin

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
        items_data = validated_data.pop('items', [])
        foreign_items_data = validated_data.pop('foreign_items', [])
        payment_data = validated_data.pop('payment_details', None)
        dispatch_data = validated_data.pop('dispatch_details', None)
        eway_bill_details_data = validated_data.pop('eway_bill_details', [])
        
        print(f"DEBUG CORE: Creating Invoice for tenant {validated_data.get('tenant_id')}")
        print(f"DEBUG NESTED: items={len(items_data)}, dispatch={'YES' if dispatch_data else 'NO'}, eway={len(eway_bill_details_data)}")
        
        # Create Invoice header
        invoice = super().create(validated_data)
        tenant_id = invoice.tenant_id

        print(f"DEBUG BRAIN: items_data count = {len(items_data)}")
        print(f"DEBUG BRAIN: foreign_items_data count = {len(foreign_items_data)}")
        
        # Create Items
        for item in items_data:
            print(f"DEBUG BRAIN: Creating Item: {item.get('item_name')}")
            VoucherSalesItems.objects.create(invoice=invoice, tenant_id=tenant_id, **item)
        
        # Create Foreign Items
        for item in foreign_items_data:
            print(f"DEBUG BRAIN: Creating Foreign Item: {item.get('item_name')}")
            VoucherSalesItemsForeign.objects.create(invoice=invoice, tenant_id=tenant_id, **item)
        
        # Create Payment Details
        if payment_data:
            VoucherSalesPaymentDetails.objects.create(invoice=invoice, tenant_id=tenant_id, **payment_data)
            
        # Create Dispatch Details
        if dispatch_data:
            VoucherSalesDispatchDetails.objects.create(invoice=invoice, tenant_id=tenant_id, **dispatch_data)
            
        # Create Eway Bill Details
        for eway_data in eway_bill_details_data:
            print(f"DEBUG BRAIN: Creating Eway Bill: {eway_data.get('eway_bill_no')}")
            VoucherSalesEwayBill.objects.create(invoice=invoice, tenant_id=tenant_id, **eway_data)

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
