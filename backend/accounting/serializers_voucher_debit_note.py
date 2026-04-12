from rest_framework import serializers
from vendors.models import VendorMasterBasicDetail
from .models_voucher_debit_note import (
    VoucherDebitNoteSupplierDetails,
    VoucherDebitNoteSupplyDetails,
    VoucherDebitNoteDueDetails,
    VoucherDebitNoteTransitDetails,
    VoucherDebitNoteItem,
)
from .models import Voucher

class VoucherDebitNoteItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherDebitNoteItem
        fields = [
            'id', 'item_code', 'item_name', 'hsn_sac', 'quantity', 'uom', 'rate',
            'taxable_value', 'igst_amount', 'cgst_amount', 'sgst_amount', 'cess_amount',
            'invoice_value'
        ]

class VoucherDebitNoteSupplyDetailsSerializer(serializers.ModelSerializer):
    items = serializers.JSONField(required=False, default=list)
    line_items = VoucherDebitNoteItemSerializer(many=True, read_only=True)
    class Meta:
        model = VoucherDebitNoteSupplyDetails
        fields = [
            'items', 'line_items', 'total_taxable_value', 'total_igst', 'total_cgst', 
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
            # Sync to Normalized Debit Note Items Table
            self._sync_debit_note_items(supply_instance, supply_data.get('items'))
        
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
        voucher = Voucher.objects.create(
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

        # --- Double-Entry Posting for Debit Note (entries table) ---
        try:
            total_amt = float(due_instance.net_amount_due if due_instance else 0)
            if total_amt > 0:
                from .services.ledger_service import post_transaction, _resolve_ledger
                from .utils_ledger import get_standard_ledger
                
                entries = []
                
                # 1. Debit the Vendor
                vendor_ledger = instance.vendor_basic_detail.ledger if instance.vendor_basic_detail else None
                if vendor_ledger:
                    entries.append({
                        "ledger_id": vendor_ledger.id,
                        "debit": total_amt,
                        "credit": 0,
                        "vendor_id": instance.vendor_basic_detail.id
                    })
                
                # 2. Credit the Purchase/Return Ledger
                # Standard: Purchase Returns or Purchase Account
                ret_ledger = get_standard_ledger(tenant_id, 'Purchase Account', 'Purchase Accounts', 'Income')
                if ret_ledger:
                    entries.append({
                        "ledger_id": ret_ledger.id,
                        "debit": 0,
                        "credit": total_amt
                    })
                
                if len(entries) == 2:
                    post_transaction(
                        voucher_type="DEBIT_NOTE",
                        voucher_id=voucher.id,
                        tenant_id=tenant_id,
                        entries=entries
                    )
        except Exception as e:
            print(f"Error posting debit note to entries: {str(e)}")
            
        return instance

    def _sync_debit_note_items(self, supply_instance, items_json):
        """Sync items JSON to VoucherDebitNoteItem table."""
        if not items_json: return
        from decimal import Decimal
        rows = items_json if isinstance(items_json, list) else []
        
        VoucherDebitNoteItem.objects.filter(supply_details=supply_instance).delete()
        for row in rows:
            if not isinstance(row, dict): continue
            VoucherDebitNoteItem.objects.create(
                supply_details=supply_instance,
                tenant_id=supply_instance.tenant_id,
                item_code=row.get('itemCode', ''),
                item_name=row.get('itemName', ''),
                hsn_sac=row.get('hsnSac', ''),
                quantity=Decimal(str(row.get('qty', 0))),
                uom=row.get('uom', ''),
                rate=Decimal(str(row.get('itemRate', 0))),
                taxable_value=Decimal(str(row.get('taxableValue', 0))),
                igst_amount=Decimal(str(row.get('igst', 0))),
                cgst_amount=Decimal(str(row.get('cgst', 0))),
                sgst_amount=Decimal(str(row.get('sgst', 0))),
                cess_amount=Decimal(str(row.get('cess', 0))),
                invoice_value=Decimal(str(row.get('invoiceValue', 0)))
            )
