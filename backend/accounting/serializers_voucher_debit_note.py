from rest_framework import serializers
from vendors.models import VendorMasterBasicDetail
from .models_voucher_debit_note import (
    VoucherDebitNoteSupplierDetails,
    VoucherDebitNoteSupplyDetails,
    VoucherDebitNoteDueDetails,
    VoucherDebitNoteTransitDetails
)
from .models import Voucher

class VoucherDebitNoteSupplyDetailsSerializer(serializers.ModelSerializer):
    items = serializers.JSONField(required=False, default=list)
    class Meta:
        model = VoucherDebitNoteSupplyDetails
        fields = [
            'items', 'total_taxable_value', 'total_igst', 'total_cgst', 
            'total_sgst', 'total_cess', 'total_invoice_value'
        ]

class VoucherDebitNoteDueDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherDebitNoteDueDetails
        fields = [
            'reverse_tcs', 'reverse_tds', 'tds_it', 
            'purchase_invoice_amount_applied', 'gross_amount_due', 
            'net_amount_due', 'terms_and_conditions'
        ]

class VoucherDebitNoteTransitDetailsSerializer(serializers.ModelSerializer):
    shipping_details = serializers.JSONField(required=False, default=dict)
    class Meta:
        model = VoucherDebitNoteTransitDetails
        fields = [
            'dispatch_from', 'mode_of_transport', 'dispatch_date', 'dispatch_time',
            'delivery_type', 'transporter_id_gstin', 'transporter_name', 
            'vehicle_no', 'lr_gr_consignment_no', 'shipping_details'
        ]

class VoucherDebitNoteSupplierDetailsSerializer(serializers.ModelSerializer):
    vendor_id = serializers.PrimaryKeyRelatedField(
        queryset=VendorMasterBasicDetail.objects.all(),
        source='vendor_basic_detail',
        required=True,
    )
    supply_details = VoucherDebitNoteSupplyDetailsSerializer(required=False, allow_null=True)
    due_details = VoucherDebitNoteDueDetailsSerializer(required=False, allow_null=True)
    transit_details = VoucherDebitNoteTransitDetailsSerializer(required=False, allow_null=True)

    class Meta:
        model = VoucherDebitNoteSupplierDetails
        fields = [
            'id', 'date', 'debit_note_series', 'debit_note_no', 
            'vendor_name', 'vendor_id', 'gstin', 'branch',
            'supplier_invoice_nos', 'purchase_voucher_nos', 'purchase_voucher_dates',
            'outward_slip_nos', 'bill_to', 'ship_to',
            'nature_of_supply', 'reverse_charge', 'place_of_supply',
            'invoice_in_foreign_currency', 'exchange_rate', 'foreign_currency',
            'supporting_document', 'supply_details', 'due_details', 'transit_details'
        ]

    def create(self, validated_data):
        supply_data = validated_data.pop('supply_details', None)
        due_data = validated_data.pop('due_details', None)
        transit_data = validated_data.pop('transit_details', None)
        
        request = self.context.get('request')
        tenant_id = None
        if request:
            from core.tenant import get_tenant_from_request
            tenant_id = get_tenant_from_request(request)
            validated_data['tenant_id'] = tenant_id

        instance = VoucherDebitNoteSupplierDetails.objects.create(**validated_data)
        
        supply_instance = None
        if supply_data:
            supply_instance = VoucherDebitNoteSupplyDetails.objects.create(
                debit_note_details=instance, tenant_id=tenant_id, **supply_data
            )
        
        due_instance = None
        if due_data:
            due_instance = VoucherDebitNoteDueDetails.objects.create(
                debit_note_details=instance, tenant_id=tenant_id, **due_data
            )
            
        if transit_data:
            VoucherDebitNoteTransitDetails.objects.create(
                debit_note_details=instance, tenant_id=tenant_id, **transit_data
            )
            
        # Create Global Voucher Reference
        voucher_no = instance.debit_note_no or f"DN-{instance.id}"
        Voucher.objects.create(
            tenant_id=tenant_id,
            type='debit_note',
            date=instance.date,
            voucher_number=voucher_no,
            party=instance.vendor_name,
            total=due_instance.net_amount_due if due_instance else 0,
            source='debit_note_voucher',
            reference_id=instance.id,
            total_taxable_amount=supply_instance.total_taxable_value if supply_instance else 0,
            total_cgst=supply_instance.total_cgst if supply_instance else 0,
            total_sgst=supply_instance.total_sgst if supply_instance else 0,
            total_igst=supply_instance.total_igst if supply_instance else 0,
            items_data=supply_instance.items if supply_instance else None,
        )
            
        return instance
