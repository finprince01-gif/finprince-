from rest_framework import serializers
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
    class Meta:
        model = VoucherPurchaseDueDetails
        fields = ['tds_gst', 'tds_it', 'advance_paid', 'to_pay', 'posting_note', 'terms', 'advance_references']

class VoucherPurchaseTransitDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherPurchaseTransitDetails
        fields = [
            'mode', 'received_in', 'receipt_date', 'receipt_time', 
            'delivery_type', 'self_third_party', 'transporter_id', 
            'transporter_name', 'vehicle_no', 'lr_gr_consignment', 
            'document', 'extra_details'
        ]

class VoucherPurchaseSupplierDetailsSerializer(serializers.ModelSerializer):
    supply_foreign_details = VoucherPurchaseSupplyForeignDetailsSerializer(required=False, allow_null=True)
    supply_inr_details = VoucherPurchaseSupplyINRDetailsSerializer(required=False, allow_null=True)
    due_details = VoucherPurchaseDueDetailsSerializer(required=False, allow_null=True)
    transit_details = VoucherPurchaseTransitDetailsSerializer(required=False, allow_null=True)

    class Meta:
        model = VoucherPurchaseSupplierDetails
        fields = [
            'id', 'date', 'supplier_invoice_no', 'purchase_voucher_no', 
            'vendor_name', 'gstin', 'grn_reference', 'bill_from', 'ship_from', 
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
        if supply_inr_data is None and 'supply_inr_details' in self.initial_data:

             supply_inr_data = self.initial_data['supply_inr_details']

        supplier_instance = VoucherPurchaseSupplierDetails.objects.create(**validated_data)
        
        # Capture tenant_id to propagate to child records
        tenant_id = supplier_instance.tenant_id

        if supply_foreign_data is not None:

            VoucherPurchaseSupplyForeignDetails.objects.create(
                supplier_details=supplier_instance, 
                tenant_id=tenant_id,
                purchase_ledger=supply_foreign_data.get('purchase_ledger'),
                **{k: v for k, v in supply_foreign_data.items() if k != 'purchase_ledger'}
            )
        
        if supply_inr_data is not None:

            # Ensure we only pass valid model fields if using raw data
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'description', 'items'}
            filtered_data = {k: v for k, v in supply_inr_data.items() if k in valid_fields}
            
            VoucherPurchaseSupplyINRDetails.objects.create(
                supplier_details=supplier_instance, 
                tenant_id=tenant_id,
                **filtered_data
            )

        if due_data is not None:
            VoucherPurchaseDueDetails.objects.create(
                supplier_details=supplier_instance, 
                tenant_id=tenant_id,
                **due_data
            )
            
        if transit_data is not None:
            VoucherPurchaseTransitDetails.objects.create(
                supplier_details=supplier_instance, 
                tenant_id=tenant_id,
                **transit_data
            )
            
        return supplier_instance

    def update(self, instance, validated_data):
        supply_foreign_data = validated_data.pop('supply_foreign_details', None)
        supply_inr_data = validated_data.pop('supply_inr_details', None)
        due_data = validated_data.pop('due_details', None)
        transit_data = validated_data.pop('transit_details', None)
        
        # Update Supplier Fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Update or Create Nested Relations
        if supply_foreign_data is not None:
            VoucherPurchaseSupplyForeignDetails.objects.update_or_create(
                supplier_details=instance,
                defaults=supply_foreign_data
            )
            
        if supply_inr_data is None and 'supply_inr_details' in self.initial_data:
             supply_inr_data = self.initial_data['supply_inr_details']

        if supply_inr_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'description', 'items'}
            filtered_data = {k: v for k, v in supply_inr_data.items() if k in valid_fields}
            
            VoucherPurchaseSupplyINRDetails.objects.update_or_create(
                supplier_details=instance,
                defaults=filtered_data
            )
            
        if due_data is not None:
            VoucherPurchaseDueDetails.objects.update_or_create(
                supplier_details=instance,
                defaults=due_data
            )
            
        if transit_data is not None:
            VoucherPurchaseTransitDetails.objects.update_or_create(
                supplier_details=instance,
                defaults=transit_data
            )
            
        return instance
