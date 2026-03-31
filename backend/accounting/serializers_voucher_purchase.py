import json
from rest_framework import serializers  # type: ignore[import]
from vendors.models import VendorMasterBasicDetail  # type: ignore[import]
from .models_voucher_purchase import (  # type: ignore[import]
    VoucherPurchaseSupplierDetails,
    VoucherPurchaseSupplyForeignDetails,
    VoucherPurchaseSupplyINRDetails,
    VoucherPurchaseDueDetails,
    VoucherPurchaseTransitDetails,
)
from .models import Voucher, MasterLedger  # type: ignore[import]
from .services.ledger_service import post_transaction, _resolve_ledger  # type: ignore[import]
from decimal import Decimal  # noqa: F401


# ---------------------------------------------------------------------------
# Nested child serializers
# ---------------------------------------------------------------------------

class VoucherPurchaseSupplyForeignDetailsSerializer(serializers.ModelSerializer):  # type: ignore[misc]
    purchase_order_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    purchase_ledger = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    items = serializers.ListField(child=serializers.DictField(), required=False, allow_empty=True)

    class Meta:
        model = VoucherPurchaseSupplyForeignDetails
        fields = ['purchase_order_no', 'purchase_ledger', 'exchange_rate', 'description', 'items']


class VoucherPurchaseSupplyINRDetailsSerializer(serializers.ModelSerializer):  # type: ignore[misc]
    purchase_order_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    purchase_ledger = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    items = serializers.ListField(child=serializers.DictField(), required=False, allow_empty=True)

    class Meta:
        model = VoucherPurchaseSupplyINRDetails
        fields = ['purchase_order_no', 'purchase_ledger', 'description', 'items']


class VoucherPurchaseDueDetailsSerializer(serializers.ModelSerializer):  # type: ignore[misc]
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
    extra_details = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = VoucherPurchaseTransitDetails
        fields = [
            'mode', 'received_in', 'receipt_date', 'receipt_time',
            'received_quantity', 'uqc', 'delivery_type', 'self_third_party',
            'transporter_id', 'transporter_name', 'vehicle_no', 'lr_gr_consignment',
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
            'id', 'date', 'supplier_invoice_no', 'supplier_invoice_date',
            'purchase_voucher_series', 'purchase_voucher_no',
            'vendor_id', 'vendor_name', 'branch', 'gstin', 'grn_reference',
            'bill_from', 'ship_from', 'input_type', 'invoice_in_foreign_currency',
            'supporting_document', 'transit_document',
            'supply_foreign_details', 'supply_inr_details',
            'due_details', 'transit_details', 'created_at',
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

        # Build a unique voucher_number to avoid DUPLICATE_ENTRY on the
        # unique_together = ('voucher_number', 'tenant_id', 'type') constraint.
        # Priority: purchase_voucher_no → supplier_invoice_no-{id} → PUR-{id}
        _base = (
            supplier_instance.purchase_voucher_no
            or (
                f"{supplier_instance.supplier_invoice_no}-{supplier_instance.id}"
                if supplier_instance.supplier_invoice_no
                else None
            )
            or f"PUR-{supplier_instance.id}"
        )
        # Extra safety: if the number still collides, append ID
        if Voucher.objects.filter(voucher_number=_base, tenant_id=tenant_id, type='purchase').exists():
            _base = f"{_base}-{supplier_instance.id}"
        purchase_voucher_number = _base

        purchase_total = due_data.get('to_pay', 0) if due_data is not None else 0

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

        voucher = Voucher.objects.create(
            tenant_id=tenant_id,
            type='purchase',
            date=supplier_instance.date,
            voucher_number=purchase_voucher_number,
            invoice_no=supplier_instance.supplier_invoice_no,
            party=supplier_instance.vendor_name,
            total=purchase_total,
            source='purchase_voucher',
            reference_id=supplier_instance.id,
            is_inter_state=supplier_instance.input_type == 'Interstate',
            total_taxable_amount=total_taxable,
            total_cgst=total_cgst,
            total_sgst=total_sgst,
            total_igst=total_igst,
            items_data=supply_inr_data.get('items') if supply_inr_data is not None else None,
        )

        setattr(supplier_instance, '_accounting_voucher_id', voucher.id)
        if any(field.name == 'voucher_id' for field in supplier_instance._meta.fields):
            supplier_instance.voucher_id = voucher.id
            supplier_instance.save(update_fields=['voucher_id'])

        # Create child objects
        if supply_foreign_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'exchange_rate', 'description', 'items'}
            filtered_data = {k: v for k, v in supply_foreign_data.items() if k in valid_fields}
            VoucherPurchaseSupplyForeignDetails.objects.create(
                supplier_details=supplier_instance, tenant_id=tenant_id, **filtered_data
            )

        if supply_inr_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'description', 'items'}
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
            }
            filtered_data = {k: v for k, v in transit_data.items() if k in valid_fields}
            if transit_document:
                filtered_data['document'] = transit_document
            VoucherPurchaseTransitDetails.objects.create(
                supplier_details=supplier_instance, tenant_id=tenant_id, **filtered_data
            )

        # --- Double-Entry Posting for Purchase (entries table) ---
        try:
            total_amt = float(purchase_total)
            if total_amt > 0:
                entries = []
                # 1. Credit the Vendor
                vendor_ledger = (
                    supplier_instance.vendor_basic_detail.ledger
                    if supplier_instance.vendor_basic_detail
                    else None
                )
                if vendor_ledger:
                    entries.append({
                        "ledger_id": vendor_ledger.id, 
                        "debit": 0, 
                        "credit": total_amt,
                        "vendor_id": supplier_instance.vendor_basic_detail.id
                    })

                # 2. Debit the Purchase Ledger
                p_ledger_name = None
                if supply_inr_data is not None:
                    p_ledger_name = supply_inr_data.get('purchase_ledger')
                elif supply_foreign_data is not None:
                    p_ledger_name = supply_foreign_data.get('purchase_ledger')

                p_ledger_obj = _resolve_ledger(p_ledger_name or 'Purchase', tenant_id)
                
                # If no Purchase ledger exists, the double-entry would fail.
                # Create a default one if it's missing to ensure it shows up in entries.
                if not p_ledger_obj:
                    # Find a group or fallback to 'Purchase Accounts'
                    from accounting.models import MasterLedgerGroup
                    p_group = MasterLedgerGroup.objects.filter(name__icontains='Purchase', tenant_id=tenant_id).first()
                    if not p_group:
                        p_group = MasterLedgerGroup.objects.create(name='Purchase Accounts', tenant_id=tenant_id)
                    p_ledger_obj = MasterLedger.objects.create(
                        name=p_ledger_name or 'Purchase Account',
                        group=p_group.name,
                        group_id=p_group,
                        tenant_id=tenant_id,
                        category='Expense'
                    )

                if p_ledger_obj:
                    entries.append({"ledger_id": p_ledger_obj.id, "debit": total_amt, "credit": 0})

                if len(entries) == 2:
                    post_transaction(
                        voucher_type="PURCHASE",
                        voucher_id=voucher.id,
                        tenant_id=tenant_id,
                        entries=entries,
                    )
                    
                    # --- Record Advance Allocation Maps (Missing Linkage) ---
                    try:
                        from accounting.models import AdvanceAllocationMap
                        adv_refs = due_data.get('advance_references', []) if due_data else []
                        if isinstance(adv_refs, list):
                            for ref in adv_refs:
                                ref_no = ref.get('refNo')
                                applied = float(ref.get('appliedNow', 0))
                                if ref_no and applied > 0:
                                    AdvanceAllocationMap.objects.create(
                                        tenant_id=tenant_id,
                                        advance_ref_no=ref_no,
                                        voucher_id=voucher.id,
                                        voucher_type='purchase',
                                        amount=applied
                                    )
                                    print(f"Registered allocation: {ref_no} -> Purchase {voucher.id}")
                    except Exception as ex:
                        print(f"FAILED TO REGISTER ADVANCE ALLOCATION: {ex}")
        except Exception as e:
            print(f"Error posting purchase to entries: {str(e)}")

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

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        tenant_id = instance.tenant_id

        # Update the unified Voucher object
        voucher_id = getattr(instance, 'voucher_id', None)
        if voucher_id:
            try:
                voucher = Voucher.objects.get(id=voucher_id)

                purchase_total = due_data.get('to_pay') if due_data is not None else voucher.total

                total_taxable = 0.0
                total_cgst = 0.0
                total_sgst = 0.0
                total_igst = 0.0
                items_list = None

                if supply_inr_data is not None and 'items' in supply_inr_data:
                    items_list = supply_inr_data['items']
                    for item in items_list:
                        total_taxable += float(item.get('taxableValue', 0))
                        total_cgst += float(item.get('cgst', 0))
                        total_sgst += float(item.get('sgst', 0))
                        total_igst += float(item.get('igst', 0))

                voucher.date = instance.date
                voucher.voucher_number = (
                    instance.purchase_voucher_no
                    or instance.supplier_invoice_no
                    or voucher.voucher_number
                )
                voucher.invoice_no = instance.supplier_invoice_no
                voucher.party = instance.vendor_name
                voucher.total = purchase_total
                voucher.is_inter_state = instance.input_type == 'Interstate'
                voucher.total_taxable_amount = total_taxable
                voucher.total_cgst = total_cgst
                voucher.total_sgst = total_sgst
                voucher.total_igst = total_igst
                if items_list is not None:
                    voucher.items_data = items_list
                voucher.save()
            except Voucher.DoesNotExist:
                pass

        # Update or Create Nested Relations
        if supply_foreign_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'exchange_rate', 'description', 'items'}
            filtered_data = {k: v for k, v in supply_foreign_data.items() if k in valid_fields}
            VoucherPurchaseSupplyForeignDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**filtered_data, 'tenant_id': tenant_id},
            )

        if supply_inr_data is not None:
            valid_fields = {'purchase_order_no', 'purchase_ledger', 'description', 'items'}
            filtered_data = {k: v for k, v in supply_inr_data.items() if k in valid_fields}
            VoucherPurchaseSupplyINRDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**filtered_data, 'tenant_id': tenant_id},
            )

        if due_data is not None:
            valid_fields = {'tds_gst', 'tds_it', 'advance_paid', 'to_pay', 'posting_note', 'terms', 'advance_references'}
            filtered_data = {k: v for k, v in due_data.items() if k in valid_fields}
            VoucherPurchaseDueDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**filtered_data, 'tenant_id': tenant_id},
            )

        if transit_data is not None:
            valid_fields = {
                'mode', 'received_in', 'receipt_date', 'receipt_time',
                'received_quantity', 'uqc', 'delivery_type', 'self_third_party',
                'transporter_id', 'transporter_name', 'vehicle_no',
                'lr_gr_consignment', 'extra_details', 'document',
            }
            filtered_data = {k: v for k, v in transit_data.items() if k in valid_fields}
            if transit_document:
                filtered_data['document'] = transit_document
            VoucherPurchaseTransitDetails.objects.update_or_create(
                supplier_details=instance,
                defaults={**filtered_data, 'tenant_id': tenant_id},
            )

        self._mirror_to_vendor_portal(instance)

        # --- Double-Entry Posting Update for Purchase (entries table) ---
        try:
            total_amt = float(purchase_total)
            if total_amt > 0 and voucher_id:
                # Clear existing entries for this voucher first to avoid duplicates
                from accounting.models import JournalEntry
                JournalEntry.objects.filter(tenant_id=tenant_id, voucher_type='PURCHASE', voucher_id=voucher_id).delete()
                
                entries = []
                # 1. Credit the Vendor
                vendor_ledger = (
                    instance.vendor_basic_detail.ledger
                    if instance.vendor_basic_detail
                    else None
                )
                if vendor_ledger:
                    entries.append({
                        "ledger_id": vendor_ledger.id, 
                        "debit": 0, 
                        "credit": total_amt,
                        "vendor_id": instance.vendor_basic_detail.id
                    })

                # 2. Debit the Purchase Ledger
                p_ledger_name = None
                if supply_inr_data is not None:
                    p_ledger_name = supply_inr_data.get('purchase_ledger')
                elif supply_foreign_data is not None:
                    p_ledger_name = supply_foreign_data.get('purchase_ledger')

                p_ledger_obj = _resolve_ledger(p_ledger_name or 'Purchase', tenant_id)
                
                # If no Purchase ledger exists, ensure one is created
                if not p_ledger_obj:
                    from accounting.models import MasterLedgerGroup
                    p_group = MasterLedgerGroup.objects.filter(name__icontains='Purchase', tenant_id=tenant_id).first()
                    if not p_group:
                        p_group = MasterLedgerGroup.objects.create(name='Purchase Accounts', tenant_id=tenant_id)
                    p_ledger_obj = MasterLedger.objects.create(
                        name=p_ledger_name or 'Purchase Account',
                        group=p_group.name,
                        group_id=p_group,
                        tenant_id=tenant_id,
                        category='Expense'
                    )

                if p_ledger_obj:
                    entries.append({"ledger_id": p_ledger_obj.id, "debit": total_amt, "credit": 0})

                if len(entries) == 2:
                    post_transaction(
                        voucher_type="PURCHASE",
                        voucher_id=voucher_id,
                        tenant_id=tenant_id,
                        entries=entries,
                    )
                    
                    # --- Record Advance Allocation Maps Update ---
                    try:
                        from accounting.models import AdvanceAllocationMap
                        # Clear old allocations for this voucher
                        AdvanceAllocationMap.objects.filter(tenant_id=tenant_id, voucher_id=voucher_id, voucher_type='purchase').delete()
                        
                        adv_refs = due_data.get('advance_references', []) if due_data else []
                        if isinstance(adv_refs, list):
                            for ref in adv_refs:
                                ref_no = ref.get('refNo')
                                applied = float(ref.get('appliedNow', 0))
                                if ref_no and applied > 0:
                                    AdvanceAllocationMap.objects.create(
                                        tenant_id=tenant_id,
                                        advance_ref_no=ref_no,
                                        voucher_id=voucher_id,
                                        voucher_type='purchase',
                                        amount=applied
                                    )
                    except Exception as ex:
                        print(f"FAILED TO UPDATE ADVANCE ALLOCATION: {ex}")
        except Exception as e:
            print(f"Error updating purchase accounting entries: {str(e)}")

        return instance

    def _mirror_to_vendor_portal(self, purchase):
        """Mirror Purchase vouchers to Vendor Portal ledger"""
        try:
            from vendors.models import VendorMasterBasicDetail, VendorTransaction
            tenant_id = purchase.tenant_id
            
            # Find vendor master
            vendor = VendorMasterBasicDetail.objects.filter(
                tenant_id=tenant_id, 
                vendor_name__iexact=purchase.vendor_name
            ).first()
            
            if vendor:
                # Calculate total amount
                due_details = getattr(purchase, 'due_details', None)
                total_amt = due_details.to_pay if due_details else 0
                
                VendorTransaction.objects.update_or_create(
                    tenant_id=tenant_id,
                    vendor_id=vendor.id,
                    transaction_number=purchase.purchase_voucher_no or purchase.supplier_invoice_no,
                    transaction_type='purchase',
                    defaults={
                        'transaction_date': purchase.date,
                        'amount': total_amt,
                        'total_amount': total_amt,
                        'status': 'Unpaid' if total_amt > 0 else 'Paid',
                        'reference_number': purchase.supplier_invoice_no,
                        'notes': f"Purchase from {purchase.vendor_name}",
                        'ledger_name': 'Purchase A/c'
                    }
                )
                print(f"!!! Vendor Sync OK (Purchase): {purchase.vendor_name}")
        except Exception as e:
            print(f"!!! Vendor Portal Sync Failure (Purchase): {str(e)}")
