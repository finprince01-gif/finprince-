from rest_framework import serializers
from vendors.models import VendorMasterBasicDetail
from .models_voucher_purchase import (
    VoucherPurchaseSupplierDetails, 
    VoucherPurchaseSupplyForeignDetails, 
    VoucherPurchaseSupplyINRDetails,
    VoucherPurchaseDueDetails, 
    VoucherPurchaseTransitDetails
)

class VoucherPurchaseSupplyForeignDetailsSerializer(serializers.ModelSerializer):
    purchase_order_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    purchase_ledger = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    items = serializers.ListField(child=serializers.DictField(), required=False, allow_empty=True)

    class Meta:
        model = VoucherPurchaseSupplyForeignDetails
        fields = ['purchase_order_no', 'purchase_ledger', 'exchange_rate', 'description', 'items']

    def validate_items(self, value):
        if not isinstance(value, list):
            return value
        
        for item in value:
            for field in ['qty', 'rate', 'igst', 'cgst', 'sgst', 'cess']:
                if field in item:
                    try:
                        val = float(item[field])
                        if val < 0:
                            raise serializers.ValidationError(f"{field} cannot be negative.")
                    except (ValueError, TypeError):
                        continue
        return value

class VoucherPurchaseSupplyINRDetailsSerializer(serializers.ModelSerializer):
    purchase_order_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    purchase_ledger = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    items = serializers.ListField(child=serializers.DictField(), required=False, allow_empty=True)

    class Meta:
        model = VoucherPurchaseSupplyINRDetails
        fields = ['purchase_order_no', 'purchase_ledger', 'description', 'items']

    def validate_items(self, value):
        if not isinstance(value, list):
            return value
        
        for item in value:
            for field in ['qty', 'rate', 'igst', 'cgst', 'sgst', 'cess']:
                if field in item:
                    try:
                        val = float(item[field])
                        if val < 0:
                            raise serializers.ValidationError(f"{field} cannot be negative.")
                    except (ValueError, TypeError):
                        continue
        return value

class VoucherPurchaseDueDetailsSerializer(serializers.ModelSerializer):
    tds_gst = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    tds_it = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    advance_paid = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    to_pay = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    posting_note = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    terms = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    advance_references = serializers.JSONField(required=False, default=list)

    class Meta:
        model = VoucherPurchaseDueDetails
        fields = ['tds_gst', 'tds_it', 'advance_paid', 'to_pay', 'posting_note', 'terms', 'advance_references']

class VoucherPurchaseTransitDetailsSerializer(serializers.ModelSerializer):
    mode = serializers.CharField(required=False, default='Road')
    received_in = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    receipt_date = serializers.DateField(required=False, allow_null=True)
    receipt_time = serializers.TimeField(required=False, allow_null=True)
    received_quantity = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    uqc = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    delivery_type = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    self_third_party = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    transporter_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    transporter_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    vehicle_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    lr_gr_consignment = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    extra_details = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = VoucherPurchaseTransitDetails
        fields = [
            'mode', 'received_in', 'receipt_date', 'receipt_time', 
            'received_quantity', 'uqc', 'delivery_type', 'self_third_party', 
            'transporter_id', 'transporter_name', 'vehicle_no', 'lr_gr_consignment', 
            'document', 'extra_details'
        ]

class VoucherPurchaseSupplierDetailsSerializer(serializers.ModelSerializer):
    vendor_id = serializers.PrimaryKeyRelatedField(
        queryset=VendorMasterBasicDetail.objects.all(),
        source='vendor_basic_detail',
        required=True
    )
    supply_foreign_details = VoucherPurchaseSupplyForeignDetailsSerializer(required=False, allow_null=True)
    supply_inr_details = VoucherPurchaseSupplyINRDetailsSerializer(required=False, allow_null=True)
    due_details = VoucherPurchaseDueDetailsSerializer(required=False, allow_null=True)
    transit_details = VoucherPurchaseTransitDetailsSerializer(required=False, allow_null=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            self.fields['vendor_id'].queryset = VendorMasterBasicDetail.objects.filter(
                tenant_id=request.user.tenant_id
            )

    class Meta:
        model = VoucherPurchaseSupplierDetails
        fields = [
            'id', 'date', 'supplier_invoice_no', 'purchase_voucher_series', 'purchase_voucher_no', 
            'vendor_id', 'vendor_name', 'branch', 'gstin', 'grn_reference', 'bill_from', 'ship_from', 
            'input_type', 'invoice_in_foreign_currency', 'supporting_document',
            'supply_foreign_details', 'supply_inr_details',
            'due_details', 'transit_details', 'created_at'
        ]

    def create(self, validated_data):
        supply_foreign_data = validated_data.pop('supply_foreign_details', None)
        supply_inr_data = validated_data.pop('supply_inr_details', None)
        due_data = validated_data.pop('due_details', None)
        transit_data = validated_data.pop('transit_details', None)
        
        # FALLBACK: If Validated Token dropped it, check initial_data
        if supply_foreign_data is None: supply_foreign_data = self.initial_data.get('supply_foreign_details')
        if supply_inr_data is None: supply_inr_data = self.initial_data.get('supply_inr_details')
        if due_data is None: due_data = self.initial_data.get('due_details')
        if transit_data is None: transit_data = self.initial_data.get('transit_details')

        supplier_instance = VoucherPurchaseSupplierDetails.objects.create(**validated_data)
        tenant_id = supplier_instance.tenant_id

        if supply_foreign_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'exchange_rate', 'description', 'items'}
            filtered_data = {k: v for k, v in supply_foreign_data.items() if k in valid_fields}
            VoucherPurchaseSupplyForeignDetails.objects.create(
                supplier_details=supplier_instance, 
                tenant_id=tenant_id,
                **filtered_data
            )
        
        if supply_inr_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'description', 'items'}
            filtered_data = {k: v for k, v in supply_inr_data.items() if k in valid_fields}
            VoucherPurchaseSupplyINRDetails.objects.create(
                supplier_details=supplier_instance, 
                tenant_id=tenant_id,
                **filtered_data
            )

        if due_data is not None:
            valid_fields = {'tds_gst', 'tds_it', 'advance_paid', 'to_pay', 'posting_note', 'terms', 'advance_references'}
            filtered_data = {k: v for k, v in due_data.items() if k in valid_fields}
            VoucherPurchaseDueDetails.objects.create(
                supplier_details=supplier_instance, 
                tenant_id=tenant_id,
                **filtered_data
            )
            
        if transit_data is not None:
            valid_fields = {'mode', 'received_in', 'receipt_date', 'receipt_time', 'received_quantity', 'uqc', 'delivery_type', 'self_third_party', 'transporter_id', 'transporter_name', 'vehicle_no', 'lr_gr_consignment', 'extra_details'}
            filtered_data = {k: v for k, v in transit_data.items() if k in valid_fields}
            VoucherPurchaseTransitDetails.objects.create(
                supplier_details=supplier_instance, 
                tenant_id=tenant_id,
                **filtered_data
            )
            
        return supplier_instance

    def update(self, instance, validated_data):
        supply_foreign_data = validated_data.pop('supply_foreign_details', None)
        supply_inr_data = validated_data.pop('supply_inr_details', None)
        due_data = validated_data.pop('due_details', None)
        transit_data = validated_data.pop('transit_details', None)
        
        # FALLBACK: If Validated Token dropped it, check initial_data
        if supply_foreign_data is None: supply_foreign_data = self.initial_data.get('supply_foreign_details')
        if supply_inr_data is None: supply_inr_data = self.initial_data.get('supply_inr_details')
        if due_data is None: due_data = self.initial_data.get('due_details')
        if transit_data is None: transit_data = self.initial_data.get('transit_details')

        # Update Supplier Fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        tenant_id = instance.tenant_id

        # Update or Create Nested Relations
        if supply_foreign_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'exchange_rate', 'description', 'items'}
            filtered_data = {k: v for k, v in supply_foreign_data.items() if k in valid_fields}
            VoucherPurchaseSupplyForeignDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**filtered_data, 'tenant_id': tenant_id}
            )
            
        if supply_inr_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'description', 'items'}
            filtered_data = {k: v for k, v in supply_inr_data.items() if k in valid_fields}
            VoucherPurchaseSupplyINRDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**filtered_data, 'tenant_id': tenant_id}
            )
            
        if due_data is not None:
            valid_fields = {'tds_gst', 'tds_it', 'advance_paid', 'to_pay', 'posting_note', 'terms', 'advance_references'}
            filtered_data = {k: v for k, v in due_data.items() if k in valid_fields}
            VoucherPurchaseDueDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**filtered_data, 'tenant_id': tenant_id}
            )
            
        if transit_data is not None:
            valid_fields = {'mode', 'received_in', 'receipt_date', 'receipt_time', 'received_quantity', 'uqc', 'delivery_type', 'self_third_party', 'transporter_id', 'transporter_name', 'vehicle_no', 'lr_gr_consignment', 'extra_details'}
            filtered_data = {k: v for k, v in transit_data.items() if k in valid_fields}
            VoucherPurchaseTransitDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**filtered_data, 'tenant_id': tenant_id}
            )
            
        return instance
