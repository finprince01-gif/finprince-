import json
from rest_framework import serializers  # type: ignore[import]
from vendors.models import VendorMasterBasicDetail  # type: ignore[import]
from .models_voucher_purchase import (  # type: ignore[import]
    VoucherPurchaseSupplierDetails,
    VoucherPurchaseSupplyForeignDetails,
    VoucherPurchaseSupplyINRDetails,
    VoucherPurchaseDueDetails,
    VoucherPurchaseTransitDetails,
    VoucherPurchaseItem,
    VoucherPurchaseAdvanceLink
)
from .models import Voucher, MasterLedger  # type: ignore[import]
from .services.ledger_service import post_transaction, _resolve_ledger  # type: ignore[import]
from vendors.models import VendorTransactionPO
from django.db.models import Q
from accounting.services.inventory_sync import sync_purchase_to_grn
from decimal import Decimal, ROUND_HALF_UP  # noqa: F401
from accounting.services.advance_service import write_allocations


class VoucherPurchaseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherPurchaseItem
        fields = [
            'id', 'item_code', 'item_name', 'hsn_sac', 'quantity', 'uom', 'rate',
            'taxable_value', 'igst_amount', 'cgst_amount', 'sgst_amount', 'cess_amount',
            'gst_rate', 'invoice_value', 'currency', 'exchange_rate'
        ]

class VoucherPurchaseAdvanceLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherPurchaseAdvanceLink
        fields = ['id', 'ref_no', 'date', 'amount', 'applied_now']

class VoucherPurchaseSupplyForeignDetailsSerializer(serializers.ModelSerializer):  # type: ignore[misc]
    purchase_order_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    purchase_ledger = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    items = serializers.JSONField(write_only=True, required=False)
    line_items = VoucherPurchaseItemSerializer(many=True, read_only=True)

    class Meta:
        model = VoucherPurchaseSupplyForeignDetails
        fields = ['purchase_order_no', 'purchase_ledger', 'exchange_rate', 'description', 'items', 'line_items']


class VoucherPurchaseSupplyINRDetailsSerializer(serializers.ModelSerializer):  # type: ignore[misc]
    purchase_order_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    purchase_ledger = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    items = serializers.JSONField(write_only=True, required=False)
    line_items = VoucherPurchaseItemSerializer(many=True, read_only=True)

    class Meta:
        model = VoucherPurchaseSupplyINRDetails
        fields = ['purchase_order_no', 'purchase_ledger', 'description', 'items', 'line_items']


class VoucherPurchaseDueDetailsSerializer(serializers.ModelSerializer):  # type: ignore[misc]
    tds_gst = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    tds_it = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    advance_paid = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    to_pay = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    posting_note = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    terms = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    advance_references = serializers.JSONField(write_only=True, required=False)
    advance_links = VoucherPurchaseAdvanceLinkSerializer(many=True, read_only=True)

    class Meta:
        model = VoucherPurchaseDueDetails
        fields = ['tds_gst', 'tds_it', 'advance_paid', 'to_pay', 'posting_note', 'terms', 'advance_references', 'advance_links']


class VoucherPurchaseTransitDetailsSerializer(serializers.ModelSerializer):  # type: ignore[misc]
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
    extra_details = serializers.JSONField(write_only=True, required=False)

    class Meta:
        model = VoucherPurchaseTransitDetails
        fields = [
            'mode', 'received_in', 'receipt_date', 'receipt_time',
            'received_quantity', 'uqc', 'delivery_type', 'self_third_party',
            'transporter_id', 'transporter_name', 'vehicle_no', 'lr_gr_consignment',
            'beyond_port_port_of_loading', 'upto_port_fnr_no', 'upto_port_origin_country', 'rail_beyond_station_loading', 'upto_port_rr_no', 'beyond_port_port_of_discharge', 'rail_beyond_rail_no', 'rail_upto_transporter_name', 'upto_port_final_dest_city', 'rail_beyond_origin_country', 'upto_port_origin_city', 'beyond_port_sb_no', 'rail_upto_delivery_type', 'rail_beyond_rr_date', 'upto_port_port_of_loading', 'rail_beyond_origin', 'upto_port_station_discharge', 'rail_upto_transporter_id', 'beyond_port_vessel_flight_no', 'beyond_port_sb_date', 'beyond_port_final_dest', 'beyond_port_dest_country', 'rail_beyond_dest_country', 'rail_beyond_final_dest', 'beyond_port_origin_country', 'upto_port_vessel_flight_no', 'rail_beyond_rr_no', 'beyond_port_ship_port_code', 'rail_beyond_station_discharge', 'upto_port_final_dest_country', 'upto_port_rr_date', 'upto_port_station_loading', 'upto_port_port_of_discharge',
            'document', 'extra_details',
        ]


# ---------------------------------------------------------------------------
# Main serializer
# ---------------------------------------------------------------------------

class VoucherPurchaseSupplierDetailsSerializer(serializers.ModelSerializer):  # type: ignore[misc]
    vendor_id = serializers.PrimaryKeyRelatedField(
        queryset=VendorMasterBasicDetail.objects.all(),
        source='vendor_basic_detail',
        required=True,
    )
    # Nested serializers — DRF accepts required/allow_null; IDE false-positives suppressed
    supply_foreign_details = VoucherPurchaseSupplyForeignDetailsSerializer(required=False, allow_null=True)  # type: ignore[call-arg]
    supply_inr_details = VoucherPurchaseSupplyINRDetailsSerializer(required=False, allow_null=True)  # type: ignore[call-arg]
    due_details = VoucherPurchaseDueDetailsSerializer(required=False, allow_null=True)  # type: ignore[call-arg]
    transit_details = VoucherPurchaseTransitDetailsSerializer(required=False, allow_null=True)  # type: ignore[call-arg]
    transit_document = serializers.FileField(required=False, write_only=True)
    line_items = VoucherPurchaseItemSerializer(many=True, read_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            self.fields['vendor_id'].queryset = VendorMasterBasicDetail.objects.filter(
                tenant_id=request.user.branch_id
            )

    class Meta:
        model = VoucherPurchaseSupplierDetails
        fields = [
            'id', 'date', 'supplier_invoice_no', 'supplier_invoice_date',
            'purchase_voucher_series', 'purchase_voucher_no',
            'vendor_id', 'vendor_name', 'branch', 'gstin', 'grn_reference',
            'bill_from', 'ship_from', 'input_type', 'invoice_in_foreign_currency',
            'supporting_document', 'transit_document',
            'supply_foreign_details', 'supply_inr_details',
            'due_details', 'transit_details', 'line_items', 'created_at',
        ]

    # ------------------------------------------------------------------
    # Shared helper — safely parse JSON strings → dict/list or return as-is
    # ------------------------------------------------------------------
    @staticmethod
    def _parse_json(val):
        """Return val unchanged if it is already a dict/list; try JSON decode if it is a str."""
        if isinstance(val, str):
            try:
                return json.loads(val)
            except (json.JSONDecodeError, ValueError):
                return None
        return val
    

    @staticmethod
    def _as_dict(val):
        """Return val if it is a dict, otherwise return an empty dict."""
        return val if isinstance(val, dict) else {}

    # ------------------------------------------------------------------
    # create
    # ------------------------------------------------------------------
    def create(self, validated_data):
        supply_foreign_data = validated_data.pop('supply_foreign_details', None)
        supply_inr_data = validated_data.pop('supply_inr_details', None)
        due_data = validated_data.pop('due_details', None)
        transit_data = validated_data.pop('transit_details', None)
        transit_document = validated_data.pop('transit_document', None)

        parse_json = self._parse_json

        supply_foreign_data = parse_json(supply_foreign_data) if supply_foreign_data is not None \
            else parse_json(self.initial_data.get('supply_foreign_details'))

        supply_inr_data = parse_json(supply_inr_data) if supply_inr_data is not None \
            else parse_json(self.initial_data.get('supply_inr_details'))

        due_data = parse_json(due_data) if due_data is not None \
            else parse_json(self.initial_data.get('due_details'))

        transit_data = parse_json(transit_data) if transit_data is not None \
            else parse_json(self.initial_data.get('transit_details'))

        # Ensure all data variables are dicts (or None) — type-safe from here on
        supply_foreign_data = supply_foreign_data if isinstance(supply_foreign_data, dict) else None
        supply_inr_data = supply_inr_data if isinstance(supply_inr_data, dict) else None
        due_data = due_data if isinstance(due_data, dict) else None
        transit_data = transit_data if isinstance(transit_data, dict) else None

        supplier_instance = VoucherPurchaseSupplierDetails.objects.create(**validated_data)
        tenant_id = supplier_instance.tenant_id

        # Build a clean voucher_number (prefer purchase_voucher_no, then supplier_invoice_no, then generated)
        purchase_voucher_number = (
            supplier_instance.purchase_voucher_no
            or supplier_instance.supplier_invoice_no
            or f"PUR-{supplier_instance.id}"
        )

        purchase_total_net = Decimal(str(due_data.get('to_pay', 0) if due_data is not None else 0))
        purchase_advance_paid = Decimal(str(due_data.get('advance_paid', 0) if due_data is not None else 0))
        purchase_total_gross = purchase_total_net + purchase_advance_paid

        # Calculate tax totals from supply_inr_data if available
        total_taxable = 0.0
        total_cgst = 0.0
        total_sgst = 0.0
        total_igst = 0.0

        if supply_inr_data is not None and 'items' in supply_inr_data:
            for item in supply_inr_data['items']:
                total_taxable += float(item.get('taxableValue', 0))
                total_cgst += float(item.get('cgst', 0))
                total_sgst += float(item.get('sgst', 0))
                total_igst += float(item.get('igst', 0))

        # Use update_or_create so repeated saves don't stack Voucher rows
        voucher, _ = Voucher.objects.update_or_create(
            tenant_id=tenant_id,
            type='purchase',
            reference_id=supplier_instance.id,
            defaults={
                'voucher_number': purchase_voucher_number,
                'date': supplier_instance.date,
                'invoice_no': supplier_instance.supplier_invoice_no,
                'party': supplier_instance.vendor_name,
                'total': purchase_total_gross,
                'source': 'purchase_voucher',
                'is_inter_state': supplier_instance.input_type == 'Interstate',
                'total_taxable_amount': total_taxable,
                'total_cgst': total_cgst,
                'total_sgst': total_sgst,
                'total_igst': total_igst,
            }
        )

        setattr(supplier_instance, '_accounting_voucher_id', voucher.id)
        if any(field.name == 'voucher_id' for field in supplier_instance._meta.fields):
            supplier_instance.voucher_id = voucher.id
            supplier_instance.save(update_fields=['voucher_id'])

        # Create child objects
        if supply_foreign_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'exchange_rate', 'description'}
            filtered_data = {k: v for k, v in supply_foreign_data.items() if k in valid_fields}
            VoucherPurchaseSupplyForeignDetails.objects.create(
                supplier_details=supplier_instance, tenant_id=tenant_id, **filtered_data
            )

        if supply_inr_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'description'}
            filtered_data = {k: v for k, v in supply_inr_data.items() if k in valid_fields}
            VoucherPurchaseSupplyINRDetails.objects.create(
                supplier_details=supplier_instance, tenant_id=tenant_id, **filtered_data
            )

        if due_data is not None:
            valid_fields = {'tds_gst', 'tds_it', 'advance_paid', 'to_pay', 'posting_note', 'terms', 'advance_references'}
            filtered_data = {k: v for k, v in due_data.items() if k in valid_fields}
            VoucherPurchaseDueDetails.objects.create(
                supplier_details=supplier_instance, tenant_id=tenant_id, **filtered_data
            )

        if transit_data is not None:
            valid_fields = {
                'mode', 'received_in', 'receipt_date', 'receipt_time',
                'received_quantity', 'uqc', 'delivery_type', 'self_third_party',
                'transporter_id', 'transporter_name', 'vehicle_no',
                'lr_gr_consignment', 'extra_details', 'document',
                'beyond_port_port_of_loading', 'upto_port_fnr_no', 'upto_port_origin_country', 'rail_beyond_station_loading', 'upto_port_rr_no', 'beyond_port_port_of_discharge', 'rail_beyond_rail_no', 'rail_upto_transporter_name', 'upto_port_final_dest_city', 'rail_beyond_origin_country', 'upto_port_origin_city', 'beyond_port_sb_no', 'rail_upto_delivery_type', 'rail_beyond_rr_date', 'upto_port_port_of_loading', 'rail_beyond_origin', 'upto_port_station_discharge', 'rail_upto_transporter_id', 'beyond_port_vessel_flight_no', 'beyond_port_sb_date', 'beyond_port_final_dest', 'beyond_port_dest_country', 'rail_beyond_dest_country', 'rail_beyond_final_dest', 'beyond_port_origin_country', 'upto_port_vessel_flight_no', 'rail_beyond_rr_no', 'beyond_port_ship_port_code', 'rail_beyond_station_discharge', 'upto_port_final_dest_country', 'upto_port_rr_date', 'upto_port_station_loading', 'upto_port_port_of_discharge',
            }
            filtered_data = {k: v for k, v in transit_data.items() if k in valid_fields}
            if transit_document:
                filtered_data['document'] = transit_document
            VoucherPurchaseTransitDetails.objects.create(
                supplier_details=supplier_instance, tenant_id=tenant_id, **filtered_data
            )

        # Sync legacy JSON to new relational tables
        self._sync_relational_data(supplier_instance, supply_inr_data, supply_foreign_data, due_data)

        # 5. Advance Allocations (Main Accounting)
        try:
            due_details = supplier_instance.due_details
            if due_details and due_details.advance_references:
                adv_refs = due_details.advance_references
                if isinstance(adv_refs, str):
                    adv_refs = json.loads(adv_refs)
                
                if adv_refs:
                    write_allocations(
                        tenant_id=tenant_id,
                        voucher_id=voucher.id,
                        voucher_type='purchase',
                        advance_refs=adv_refs,
                        ledger_id=supplier_instance.vendor_basic_detail.ledger_id if supplier_instance.vendor_basic_detail else None
                    )
        except Exception as alloc_e:
            print(f"!!! Advance Allocation Save Failed: {alloc_e}")

        # 6. Double-Entry Posting
        self._post_journal_entries(supplier_instance, voucher.id, purchase_total_gross, supply_inr_data, supply_foreign_data, due_data)

        # 6.5. PO Auto-Status Update
        po_no = None
        if supply_inr_data and supply_inr_data.get('purchase_order_no'):
            po_no = supply_inr_data.get('purchase_order_no')
        elif supply_foreign_data and supply_foreign_data.get('purchase_order_no'):
            po_no = supply_foreign_data.get('purchase_order_no')
            
        if po_no:
            try:
                from vendors import vendorpo_database as db
                db.auto_update_po_if_fully_executed(tenant_id, po_no)
            except Exception:
                pass

        # 7. Mirror to Vendor Portal
        self._mirror_to_vendor_portal(supplier_instance)

        # Auto-sync to Inventory > Operations > GRN
        sync_purchase_to_grn(supplier_instance, supply_inr_data, supply_foreign_data)

        # Update PO Status
        po_no = None
        if supply_inr_data and supply_inr_data.get('purchase_order_no'):
            po_no = supply_inr_data.get('purchase_order_no')
        elif supply_foreign_data and supply_foreign_data.get('purchase_order_no'):
            po_no = supply_foreign_data.get('purchase_order_no')
        

        return supplier_instance

    # ------------------------------------------------------------------
    # update
    # ------------------------------------------------------------------
    def update(self, instance, validated_data):
        supply_foreign_data = validated_data.pop('supply_foreign_details', None)
        supply_inr_data = validated_data.pop('supply_inr_details', None)
        due_data = validated_data.pop('due_details', None)
        transit_data = validated_data.pop('transit_details', None)
        transit_document = validated_data.pop('transit_document', None)

        parse_json = self._parse_json

        supply_foreign_data = parse_json(supply_foreign_data) if supply_foreign_data is not None \
            else parse_json(self.initial_data.get('supply_foreign_details'))

        supply_inr_data = parse_json(supply_inr_data) if supply_inr_data is not None \
            else parse_json(self.initial_data.get('supply_inr_details'))

        due_data = parse_json(due_data) if due_data is not None \
            else parse_json(self.initial_data.get('due_details'))

        transit_data = parse_json(transit_data) if transit_data is not None \
            else parse_json(self.initial_data.get('transit_details'))

        # Ensure all data variables are dicts (or None) — type-safe from here on
        supply_foreign_data = supply_foreign_data if isinstance(supply_foreign_data, dict) else None
        supply_inr_data = supply_inr_data if isinstance(supply_inr_data, dict) else None
        due_data = due_data if isinstance(due_data, dict) else None
        transit_data = transit_data if isinstance(transit_data, dict) else None

        # Map flat items array back to supply_inr_data if present in initial_data
        if supply_inr_data is not None and 'items' in self.initial_data and not supply_inr_data.get('items'):
            supply_inr_data['items'] = self.initial_data['items']

        # Update custom mapped fields from frontend
        if 'party' in self.initial_data:
            instance.vendor_name = self.initial_data.get('party', '')
        if 'bill_from' in self.initial_data:
            instance.bill_from = self.initial_data.get('bill_from', '')
        elif 'bill_from_address_1' in self.initial_data:
            instance.bill_from = self.initial_data.get('bill_from_address_1', '')
            
        if 'ship_from' in self.initial_data:
            instance.ship_from = self.initial_data.get('ship_from', '')
        elif 'ship_from_address_1' in self.initial_data:
            instance.ship_from = self.initial_data.get('ship_from_address_1', '')
        if 'supplier_invoice_date' in self.initial_data:
            instance.supplier_invoice_date = self.initial_data.get('supplier_invoice_date', '')
        elif 'date' in self.initial_data:
            instance.supplier_invoice_date = self.initial_data.get('date', '')
        if 'purchase_voucher_series' in self.initial_data:
            instance.purchase_voucher_series = self.initial_data.get('purchase_voucher_series', '')
        if 'grn_reference' in self.initial_data:
            instance.grn_reference = self.initial_data.get('grn_reference', '')
        if 'input_type' in self.initial_data:
            instance.input_type = self.initial_data.get('input_type', '')
        if 'gstin' in self.initial_data:
            instance.gstin = self.initial_data.get('gstin', '')

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        tenant_id = instance.tenant_id

        net_val = Decimal(str(due_data.get('to_pay', 0) if due_data else 0))
        adv_val = Decimal(str(due_data.get('advance_paid', 0) if due_data else 0))
        purchase_total_gross = net_val + adv_val

        # ── Resolve the generic Voucher record for this supplier instance ──────
        # VoucherPurchaseSupplierDetails has no voucher_id column, so we look up
        # by reference_id which is set during create() to link the two tables.
        p_ledger_name = None
        if supply_inr_data: p_ledger_name = supply_inr_data.get('purchase_ledger')
        elif supply_foreign_data: p_ledger_name = supply_foreign_data.get('purchase_ledger')

        purchase_voucher_number = instance.purchase_voucher_no or instance.supplier_invoice_no or f"PUR-{instance.id}"

        # update_or_create: ensures we always have one canonical Voucher row
        # and that its totals/date are updated to match the edited purchase.
        voucher_obj, _ = Voucher.objects.update_or_create(
            tenant_id=tenant_id,
            type='purchase',
            reference_id=instance.id,
            defaults={
                'voucher_number': purchase_voucher_number,
                'date': instance.date,
                'party': instance.vendor_name,
                'total': purchase_total_gross,
                'invoice_no': instance.supplier_invoice_no,
                'source': 'purchase_voucher',
            }
        )
        voucher_id = voucher_obj.id  # This is the real, stable ID for journal entries

        # Update or Create Nested Relations
        if supply_foreign_data is not None:
            VoucherPurchaseSupplyForeignDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**supply_foreign_data, 'tenant_id': tenant_id},
            )

        if supply_inr_data is not None:
            VoucherPurchaseSupplyINRDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**supply_inr_data, 'tenant_id': tenant_id},
            )

        if due_data is not None:
            VoucherPurchaseDueDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**due_data, 'tenant_id': tenant_id},
            )

        if transit_data is not None:
            if transit_document:
                transit_data['document'] = transit_document
            VoucherPurchaseTransitDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**transit_data, 'tenant_id': tenant_id},
            )

        # Sync legacy JSON to new relational tables
        self._sync_relational_data(instance, supply_inr_data, supply_foreign_data, due_data)

        # Advance Allocations (Main Accounting)
        try:
            if due_data and 'advance_references' in due_data:
                adv_refs = due_data['advance_references']
                if isinstance(adv_refs, str):
                    adv_refs = json.loads(adv_refs)

                if adv_refs:
                    write_allocations(
                        tenant_id=tenant_id,
                        voucher_id=voucher_id,   # ← NOW correctly set
                        voucher_type='purchase',
                        advance_refs=adv_refs,
                        ledger_id=instance.vendor_basic_detail.ledger_id if instance.vendor_basic_detail else None
                    )
        except Exception as alloc_e:
            print(f"!!! Advance Allocation Update Failed: {alloc_e}")

        self._mirror_to_vendor_portal(instance)

        # Auto-sync to Inventory > Operations > GRN
        sync_purchase_to_grn(instance, supply_inr_data, supply_foreign_data)

        # Refresh double-entry posting — now passes real voucher_id so
        # post_transaction() will delete stale entries before inserting fresh ones
        self._post_journal_entries(instance, voucher_id, purchase_total_gross, supply_inr_data, supply_foreign_data, due_data)

        return instance

    def _sync_relational_data(self, supplier_instance, inr_data, foreign_data, due_data):
        """Bridge between legacy JSON arrays and normalized child tables."""
        tenant_id = supplier_instance.tenant_id
        
        # 1. Clear existing relational items/links for this supplier (clean replace)
        VoucherPurchaseItem.objects.filter(supplier_details=supplier_instance).delete()
        if hasattr(supplier_instance, 'due_details'):
            VoucherPurchaseAdvanceLink.objects.filter(due_details=supplier_instance.due_details).delete()

        # 2. Sync Items (avoid duplication by chosen primary source)
        is_foreign = supplier_instance.invoice_in_foreign_currency == 'Yes'
        source_data = foreign_data if is_foreign else inr_data
        # Fallback if preferred source is missing
        if not source_data:
            source_data = inr_data if inr_data else foreign_data

        if source_data and 'items' in source_data:
            ex_rate = Decimal(str(source_data.get('exchange_rate', 1.0)))
            cur = supplier_instance.invoice_in_foreign_currency if is_foreign else 'INR'
            if cur == 'No': cur = 'INR'
            
            for item in source_data['items']:
                if not isinstance(item, dict): continue
                # In normalized frontend, 'qty' and 'itemRate' are standard
                q = item.get('qty') or item.get('quantity') or 0
                r = item.get('itemRate') or item.get('rate') or 0
                tx_val = item.get('taxableValue') or item.get('amount') or 0
                inv_val = item.get('invoiceValue') or item.get('amount') or 0
                
                VoucherPurchaseItem.objects.create(
                    supplier_details=supplier_instance,
                    tenant_id=tenant_id,
                    item_code=item.get('itemCode', item.get('item_code', '')),
                    item_name=item.get('itemName', item.get('item_name', '')),
                    hsn_sac=item.get('hsnSac', item.get('hsn_sac', '')),
                    quantity=Decimal(str(q)),
                    uom=item.get('uom', ''),
                    rate=Decimal(str(r)),
                    taxable_value=Decimal(str(tx_val)),
                    igst_amount=Decimal(str(item.get('igst', 0))),
                    cgst_amount=Decimal(str(item.get('cgst', 0))),
                    sgst_amount=Decimal(str(item.get('sgst', 0))),
                    cess_amount=Decimal(str(item.get('cess', 0))),
                    gst_rate=Decimal(str(item.get('gstRate', item.get('gst_rate', 0)))),
                    invoice_value=Decimal(str(inv_val)).quantize(Decimal('0.00'), rounding=ROUND_HALF_UP),
                    currency=cur,
                    exchange_rate=ex_rate
                )

        # 4. Sync Advance Links
        if due_data and 'advance_references' in due_data:
            due_details = supplier_instance.due_details
            refs = due_data['advance_references']
            if isinstance(refs, str):
                try: refs = json.loads(refs)
                except: refs = []
            
            if isinstance(refs, list):
                for adv in refs:
                    if not isinstance(adv, dict): continue
                    VoucherPurchaseAdvanceLink.objects.create(
                        due_details=due_details,
                        tenant_id=tenant_id,
                        ref_no=adv.get('refNo', ''),
                        date=adv.get('date'),
                        amount=Decimal(str(adv.get('amount', 0))),
                        applied_now=Decimal(str(adv.get('appliedNow', 0)))
                    )

    def _mirror_to_vendor_portal(self, purchase):
        """
        Mirror a Purchase voucher to the Vendor Portal ledger (VendorTransaction).
        Called from both create() and update() so the procurement ledger is always
        up-to-date and Due / Not Due status is calculated correctly by the API.
        """
        try:
            from vendors.models import VendorMasterBasicDetail, VendorTransaction
            tenant_id = purchase.tenant_id

            # Resolve the canonical transaction number (prefer purchase voucher no)
            tx_number = (
                purchase.purchase_voucher_no
                or purchase.supplier_invoice_no
                or f"PUR-{purchase.id}"
            )

            # Canonical mapping reference (Critical for Vendor Portal Allocation View)
            # Ensure group_ref is never empty or just whitespace
            group_ref = (purchase.supplier_invoice_no or '').strip() or tx_number

            # Prefer vendor_basic_detail FK; fall back to name match
            vendor = None
            if purchase.vendor_basic_detail_id:
                vendor = VendorMasterBasicDetail.objects.filter(
                    tenant_id=tenant_id,
                    id=purchase.vendor_basic_detail_id
                ).first()
            if not vendor and purchase.vendor_name:
                vendor = VendorMasterBasicDetail.objects.filter(
                    tenant_id=tenant_id,
                    vendor_name__iexact=purchase.vendor_name
                ).first()

            if not vendor:
                print(f"!!! Vendor Portal Sync: no vendor found for '{purchase.vendor_name}'")
                return

            # Pull the to_pay amount from the related DueDetails row
            try:
                due_details = purchase.due_details
                net_amt = Decimal(str(due_details.to_pay or 0))
                adv_amt = Decimal(str(due_details.advance_paid or 0))
                total_gross = net_amt + adv_amt
            except Exception:
                total_gross = 0

            # Purchase should reflect full invoice value; status will be calculated by child payments
            tx_status = 'Received' if float(total_gross or 0) == 0 else 'Unpaid'

            VendorTransaction.objects.update_or_create(
                tenant_id=tenant_id,
                vendor_id=vendor.id,
                transaction_number=tx_number,
                transaction_type='purchase',
                defaults={
                    'transaction_date': purchase.date,
                    'amount': total_gross,
                    'total_amount': total_gross,
                    'status': tx_status,
                    'reference_number': group_ref,
                    'notes': f"Purchase from {purchase.vendor_name}",
                    'ledger_name': 'Purchase A/c',
                }
            )

            # --- ── Handle Advance/Payment Allocations (Phase 4C) ────────────────── ---
            try:
                # 1. Idempotency: Restore amounts to source advances from OLD allocations of this purchase.
                # All allocations from this purchase start with "PUR-{id}-ALLOC-" or similar.
                existing_allocs = VendorTransaction.objects.filter(
                    tenant_id=tenant_id,
                    vendor_id=vendor.id,
                    transaction_number__startswith=f"ALC-{tx_number}-"
                )
                for ea in existing_allocs:
                    # In our pattern, transaction_number is f"ALC-{tx_number}-{ref_no}"
                    parts = ea.transaction_number.split(f"ALC-{tx_number}-")
                    if len(parts) > 1:
                        source_ref = parts[1]
                        # Restore balance to the source 'Advance' record
                        src_adv = VendorTransaction.objects.filter(
                            tenant_id=tenant_id,
                            vendor_id=vendor.id,
                            transaction_type='payment',
                            reference_number=source_ref,
                            status='Advance'
                        ).first()
                        if src_adv:
                            src_adv.amount += ea.amount
                            src_adv.total_amount += ea.amount
                            src_adv.save()
                    ea.delete()

                # 2. Apply current allocations
                due_details = getattr(purchase, 'due_details', None)
                adv_refs = due_details.advance_references if due_details and due_details.advance_references else []
                
                # Normalize refs in case they are JSON strings
                if isinstance(adv_refs, str):
                    try:
                        adv_refs = json.loads(adv_refs)
                    except:
                        adv_refs = []

                for ref_item in adv_refs:
                    ref_no = ref_item.get('refNo') or ref_item.get('reference_number')
                    applied_amt = Decimal(str(ref_item.get('appliedNow') or ref_item.get('applied_amount') or 0))

                    if not ref_no or applied_amt <= 0:
                        continue

                    # Create the ALLOCATION record (points to purchase reference)
                    VendorTransaction.objects.create(
                        tenant_id=tenant_id,
                        vendor_id=vendor.id,
                        transaction_number=f"ALC-{tx_number}-{ref_no}",
                        transaction_type='payment',
                        transaction_date=purchase.date,
                        amount=applied_amt,
                        total_amount=applied_amt,
                        status='Paid',
                        reference_number=group_ref, # This links it to the Purchase row
                        notes=f"Allocated to {group_ref} from {ref_no}",
                        ledger_name=vendor.vendor_name
                    )

                    # Decrease the source 'Advance' record
                    src_adv = VendorTransaction.objects.filter(
                        tenant_id=tenant_id,
                        vendor_id=vendor.id,
                        transaction_type='payment',
                        reference_number=ref_no,
                        status='Advance'
                    ).first()
                    if src_adv:
                        src_adv.amount -= applied_amt
                        src_adv.total_amount -= applied_amt
                        if src_adv.amount <= 0:
                            # If fully consumed, we can set it to a dummy state or negative etc.
                            # But setting amount to 0 is enough to exclude it from outstanding.
                            src_adv.amount = 0
                            src_adv.total_amount = 0
                            src_adv.status = 'Fully Utilized' 
                        src_adv.save()

                # 3. Update the Purchase transaction's status based on total allocations
                # (Recalculate status: if total_paid >= total_amount -> Paid)
                # Re-fetch p_tx to be sure
                p_tx = VendorTransaction.objects.filter(
                    tenant_id=tenant_id,
                    vendor_id=vendor.id,
                    transaction_number=tx_number,
                    transaction_type='purchase'
                ).first()
                if p_tx:
                    total_paid = sum(
                        Decimal(str(ltx.amount)) 
                        for ltx in VendorTransaction.objects.filter(
                            tenant_id=tenant_id,
                            vendor_id=vendor.id,
                            reference_number=p_tx.reference_number
                        ).exclude(id=p_tx.id)
                    )
                    if total_paid >= p_tx.total_amount:
                        p_tx.status = 'Paid'
                    elif total_paid > 0:
                        p_tx.status = 'Partially Paid'
                    p_tx.save(update_fields=['status'])

            except Exception as inner_e:
                print(f"!!! Error syncing allocations to Vendor Portal: {inner_e}")

            print(f"!!! Vendor Sync OK (Purchase): {purchase.vendor_name} | tx={tx_number} | amt={total_gross}")
        except Exception as e:
            print(f"!!! Vendor Portal Sync Failure (Purchase): {str(e)}")

    def _post_journal_entries(self, supplier_instance, voucher_id, purchase_total, supply_inr_data, supply_foreign_data, due_data):
        """Unified double-entry posting for purchase invoice with individual GST component posting."""
        try:
            from accounting.utils_ledger import get_standard_ledger
            from accounting.models import JournalEntry
            from decimal import Decimal as D
            tenant_id = supplier_instance.tenant_id
            total_amt = float(purchase_total)
            if total_amt <= 0 or not voucher_id:
                return

            # Collect individual GST amounts from line items
            total_igst = 0.0
            total_cgst = 0.0
            total_sgst = 0.0
            total_cess = 0.0

            for item in supplier_instance.line_items.all():
                total_igst += float(item.igst_amount or 0)
                total_cgst += float(item.cgst_amount or 0)
                total_sgst += float(item.sgst_amount or 0)
                total_cess += float(item.cess_amount or 0)

            total_tax = total_igst + total_cgst + total_sgst + total_cess
            taxable_amt = total_amt - total_tax

            entries = []

            # Determine TDS amount
            tds_amt = 0.0
            if due_data and 'tds_it' in due_data:
                tds_amt = float(due_data.get('tds_it') or 0)

            # 1. Credit the Vendor (Invoice Total minus TDS)
            # In a purchase, the vendor owes us the TDS amount which we will pay to govt
            vendor_credit_amt = total_amt - tds_amt
            vendor_ledger = supplier_instance.vendor_basic_detail.ledger if supplier_instance.vendor_basic_detail else None
            if vendor_ledger and vendor_credit_amt > 0:
                entries.append({"ledger_id": vendor_ledger.id, "debit": 0, "credit": vendor_credit_amt})

            # 2. Credit the TDS/TCS Ledger (TDS/TCS Amount)
            tax_master_ledger = None
            tax_section_name = "Unspecified Section"
            is_tcs = False
            
            if tds_amt > 0:
                # Try to resolve the specific section name for supplementary rows and ledger selection
                if supplier_instance.vendor_basic_detail:
                    try:
                        from vendors.models import VendorMasterTDS
                        tds_obj = VendorMasterTDS.objects.filter(
                            vendor_basic_detail_id=supplier_instance.vendor_basic_detail.id
                        ).last()
                        if tds_obj:
                            # In VendorMasterTDS, TCS fields are tcs_enabled and tcs_section_applicable
                            if getattr(tds_obj, 'tcs_enabled', False) and getattr(tds_obj, 'tcs_section_applicable', ''):
                                tax_section_name = tds_obj.tcs_section_applicable.strip()
                                is_tcs = True
                            elif getattr(tds_obj, 'tcs_section_applicable', '') and not getattr(tds_obj, 'tds_section_applicable', ''):
                                # Fallback if tcs_enabled doesn't exist but tcs_section_applicable does
                                tax_section_name = tds_obj.tcs_section_applicable.strip()
                                is_tcs = True
                            elif getattr(tds_obj, 'tds_section_applicable', ''):
                                tax_section_name = tds_obj.tds_section_applicable.strip()
                    except Exception:
                        pass
                
                if is_tcs:
                    tax_master_ledger = get_standard_ledger(tenant_id, 'TCS Payable', 'Duties & Taxes', 'Liability')
                else:
                    tax_master_ledger = get_standard_ledger(tenant_id, 'TDS Payable', 'Duties & Taxes', 'Liability')

                entries.append({"ledger_id": tax_master_ledger.id, "debit": 0, "credit": tds_amt})

            # 3. Debit the Purchase Ledger (Taxable Value only)
            p_ledger_name = None
            if supply_inr_data: p_ledger_name = supply_inr_data.get('purchase_ledger')
            elif supply_foreign_data: p_ledger_name = supply_foreign_data.get('purchase_ledger')

            p_ledger_obj = _resolve_ledger(p_ledger_name or 'Purchase', tenant_id)
            if not p_ledger_obj:
                p_ledger_obj = get_standard_ledger(tenant_id, 'Purchase Account', 'Purchase Accounts', 'Expense')

            if p_ledger_obj and taxable_amt > 0:
                entries.append({"ledger_id": p_ledger_obj.id, "debit": taxable_amt, "credit": 0})

            # 4. Debit Input Tax Credit Ledger (Total Tax — single aggregated entry for balance)
            if total_tax > 0:
                itc_ledger = get_standard_ledger(tenant_id, 'Input Tax Credit Ledger', 'Duties & Taxes', 'Liability')
                entries.append({"ledger_id": itc_ledger.id, "debit": total_tax, "credit": 0})

            if len(entries) >= 2:
                post_transaction(
                    voucher_type="PURCHASE",
                    voucher_id=voucher_id,
                    tenant_id=tenant_id,
                    entries=entries,
                    transaction_date=supplier_instance.date,
                    voucher_number=supplier_instance.purchase_voucher_no or supplier_instance.supplier_invoice_no
                )

                # 4. Write supplementary GST detail rows so the drill-down shows breakdown
                # These are informational entries on the ITC ledger; they do NOT
                # affect the running balance (they are not double-entry balanced lines).
                # We store them with voucher_type = "PURCHASE_GST_DETAIL" to distinguish.
                if total_tax > 0:
                    detail_rows = []
                    gst_detail_type = "PURCHASE_GST_DETAIL"
                    voucher_no = supplier_instance.purchase_voucher_no or supplier_instance.supplier_invoice_no

                    # Delete any existing detail rows first (idempotent)
                    JournalEntry.objects.filter(
                        tenant_id=tenant_id,
                        voucher_type=gst_detail_type,
                        voucher_id=voucher_id
                    ).delete()

                    component_map = [
                        ("IGST", total_igst),
                        ("CGST", total_cgst),
                        ("SGST/UTGST", total_sgst),
                        ("Cess", total_cess),
                    ]
                    for component_name, component_amt in component_map:
                        if component_amt > 0:
                            detail_rows.append(JournalEntry(
                                tenant_id=tenant_id,
                                voucher_type=gst_detail_type,
                                voucher_id=voucher_id,
                                voucher_number=voucher_no,
                                transaction_date=supplier_instance.date,
                                ledger_id=itc_ledger.id,
                                ledger_name=f"Input Tax Credit Ledger ({component_name})",
                                ledger_id_val=itc_ledger.id,
                                debit=D(str(component_amt)),
                                credit=D('0.00'),
                            ))
                    if detail_rows:
                        JournalEntry.objects.bulk_create(detail_rows)

                # 5. Write supplementary TDS/TCS detail rows for drill-down breakdown
                if tds_amt > 0 and tax_master_ledger:
                    tax_detail_type = "PURCHASE_TCS_DETAIL" if is_tcs else "PURCHASE_TDS_DETAIL"
                    voucher_no = supplier_instance.purchase_voucher_no or supplier_instance.supplier_invoice_no
                    
                    # Delete any existing detail rows (both types just in case they switched)
                    JournalEntry.objects.filter(
                        tenant_id=tenant_id,
                        voucher_type__in=["PURCHASE_TDS_DETAIL", "PURCHASE_TCS_DETAIL"],
                        voucher_id=voucher_id
                    ).delete()
                    
                    JournalEntry.objects.create(
                        tenant_id=tenant_id,
                        voucher_type=tax_detail_type,
                        voucher_id=voucher_id,
                        voucher_number=voucher_no,
                        transaction_date=supplier_instance.date,
                        ledger_id=tax_master_ledger.id,
                        ledger_name=f"{'TCS Payable' if is_tcs else 'TDS Payable'} ({tax_section_name})",
                        ledger_id_val=tax_master_ledger.id,
                        debit=D('0.00'),
                        credit=D(str(tds_amt)),
                    )

                # Advance Allocations
                from accounting.services.advance_service import write_allocations
                adv_refs = due_data.get('advance_references', []) if due_data else []
                if adv_refs:
                    try:
                        write_allocations(
                            tenant_id=tenant_id,
                            voucher_id=voucher_id,
                            voucher_type='purchase',
                            advance_refs=adv_refs,
                            ledger_id=vendor_ledger.id if vendor_ledger else None
                        )
                    except Exception as ex:
                        print(f"[PurchaseSerializer] Advance allocation update failed: {ex}")
        except Exception as e:
            print(f"Error posting purchase entries: {str(e)}")
