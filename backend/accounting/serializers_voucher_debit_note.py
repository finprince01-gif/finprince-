import json
from decimal import Decimal
from rest_framework import serializers
from vendors.models import VendorMasterBasicDetail
from .models_voucher_debit_note import (
    VoucherDebitNoteSupplierDetails,
    VoucherDebitNoteSupplyDetails,
    VoucherDebitNoteDueDetails,
    VoucherDebitNoteTransitDetails,
<<<<<<< HEAD
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
=======
)
from .models import Voucher


# ---------------------------------------------------------------------------
# Nested serializers
# ---------------------------------------------------------------------------

class VoucherDebitNoteSupplyDetailsSerializer(serializers.ModelSerializer):
    items = serializers.JSONField(required=False, default=list)

    class Meta:
        model = VoucherDebitNoteSupplyDetails
        fields = [
            "items",
            "total_taxable_value",
            "total_igst",
            "total_cgst",
            "total_sgst",
            "total_cess",
            "total_invoice_value",
>>>>>>> origin/main
        ]


class VoucherDebitNoteDueDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherDebitNoteDueDetails
        fields = [
            "reverse_tcs",
            "reverse_tds",
            "tds_it",
            "reverse_gst_tcs",
            "reverse_gst_tds",
            "reverse_income_tax_tcs",
            "reverse_income_tax_tds",
            "purchase_invoice_amount_applied",
            "gross_amount_due",
            "net_amount_due",
            "terms_and_conditions",
        ]


class VoucherDebitNoteTransitDetailsSerializer(serializers.ModelSerializer):
    shipping_details = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = VoucherDebitNoteTransitDetails
        fields = [
            "dispatch_from",
            "mode_of_transport",
            "dispatch_date",
            "dispatch_time",
            "delivery_type",
            "transporter_id_gstin",
            "transporter_name",
            "vehicle_no",
            "lr_gr_consignment_no",
            "shipping_details",
        ]


# ---------------------------------------------------------------------------
# Main serializer
# ---------------------------------------------------------------------------

class VoucherDebitNoteSupplierDetailsSerializer(serializers.ModelSerializer):
    vendor_id = serializers.PrimaryKeyRelatedField(
        queryset=VendorMasterBasicDetail.objects.all(),
        source="vendor_basic_detail",
        required=True,
    )
    supply_details  = VoucherDebitNoteSupplyDetailsSerializer(required=False, allow_null=True)
    due_details     = VoucherDebitNoteDueDetailsSerializer(required=False, allow_null=True)
    transit_details = VoucherDebitNoteTransitDetailsSerializer(required=False, allow_null=True)

    # Extra fields consumed by the posting pipeline but not stored on the model
    payment_details = serializers.JSONField(
        required=False, default=list, write_only=True,
        help_text="Payment Details tab rows: [{supplierInvoiceNo, appliedNow, ...}]"
    )
    company_pos = serializers.CharField(
        required=False, allow_blank=True, write_only=True, default="",
        help_text="Registered state of the company (for IGST vs CGST/SGST determination)"
    )

    class Meta:
        model = VoucherDebitNoteSupplierDetails
        fields = [
            "id",
            "date",
            "debit_note_series",
            "debit_note_no",
            "vendor_name",
            "vendor_id",
            "gstin",
            "branch",
            "supplier_invoice_nos",
            "purchase_voucher_nos",
            "purchase_voucher_dates",
            "outward_slip_nos",
            "bill_to",
            "ship_to",
            "nature_of_supply",
            "reverse_charge",
            "place_of_supply",
            "invoice_in_foreign_currency",
            "exchange_rate",
            "foreign_currency",
            "narration",
            "supporting_document",
            "supply_details",
            "due_details",
            "transit_details",
            # write-only helpers
            "payment_details",
            "company_pos",
        ]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_json(val):
        if isinstance(val, str):
            try:
                return json.loads(val)
            except (json.JSONDecodeError, ValueError):
                return None
        return val

    def to_internal_value(self, data):
        """Accept JSON strings (multi-part form submissions)."""
        if hasattr(data, "dict"):
            data = data.dict()
        data = dict(data)
        for field in ["supply_details", "due_details", "transit_details", "payment_details"]:
            if field in data and isinstance(data[field], str):
                try:
                    data[field] = json.loads(data[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        return super().to_internal_value(data)

    # ------------------------------------------------------------------
    # CREATE
    # ------------------------------------------------------------------

    def create(self, validated_data):
        supply_data      = validated_data.pop("supply_details", None)
        due_data_raw     = validated_data.pop("due_details", None)
        transit_data     = validated_data.pop("transit_details", None)
        payment_details  = validated_data.pop("payment_details", []) or []
        company_pos      = validated_data.pop("company_pos", "") or ""

        request    = self.context.get("request")
        tenant_id  = None
        if request:
            from core.tenant import get_tenant_from_request
            tenant_id = get_tenant_from_request(request)
            validated_data["tenant_id"] = tenant_id

        # ── Persist header ────────────────────────────────────────────
        instance = VoucherDebitNoteSupplierDetails.objects.create(**validated_data)

        # ── Persist nested tabs ───────────────────────────────────────
        supply_instance = None
        if supply_data:
            supply_instance = VoucherDebitNoteSupplyDetails.objects.create(
                debit_note_details=instance, tenant_id=tenant_id, **supply_data
            )
<<<<<<< HEAD
            # Sync to Normalized Debit Note Items Table
            self._sync_debit_note_items(supply_instance, supply_data.get('items'))
        
=======

>>>>>>> origin/main
        due_instance = None
        if due_data_raw:
            due_instance = VoucherDebitNoteDueDetails.objects.create(
                debit_note_details=instance, tenant_id=tenant_id, **due_data_raw
            )

        if transit_data:
            VoucherDebitNoteTransitDetails.objects.create(
                debit_note_details=instance, tenant_id=tenant_id, **transit_data
            )
<<<<<<< HEAD
            
        # Create Global Voucher Reference
        voucher_no = instance.debit_note_no or f"DN-{instance.id}"
=======

        # ── Build global Voucher reference ────────────────────────────
        dn_number = instance.debit_note_no or f"DN-{instance.id}"
        # Avoid collision on unique_together (tenant_id, type, voucher_number)
        if Voucher.objects.filter(voucher_number=dn_number, tenant_id=tenant_id, type="debit_note").exists():
            dn_number = f"{dn_number}-{instance.id}"

        net_amount = Decimal(str(due_instance.net_amount_due if due_instance else 0))

>>>>>>> origin/main
        voucher = Voucher.objects.create(
            tenant_id=tenant_id,
            type="debit_note",
            date=instance.date,
            voucher_number=dn_number,
            party=instance.vendor_name,
            total=net_amount,
            source="debit_note_voucher",
            reference_id=instance.id,
            total_taxable_amount=(
                supply_instance.total_taxable_value if supply_instance else 0
            ),
            total_cgst=(supply_instance.total_cgst if supply_instance else 0),
            total_sgst=(supply_instance.total_sgst if supply_instance else 0),
            total_igst=(supply_instance.total_igst if supply_instance else 0),
            items_data=(supply_instance.items if supply_instance else None),
        )

<<<<<<< HEAD
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
            
=======
        # ── Determine Tax Type ────────────────────────────────────────
        from .services.debit_note_service import determine_tax_type, post_debit_note

        tax_type = determine_tax_type(
            nature_of_supply=instance.nature_of_supply or "Regular",
            pos=instance.place_of_supply or "",
            company_pos=company_pos,
        )

        # ── Full posting pipeline ─────────────────────────────────────
        supply_dict = {}
        if supply_instance:
            supply_dict = {
                "items": supply_instance.items or [],
                "total_taxable_value": float(supply_instance.total_taxable_value or 0),
                "total_igst":  float(supply_instance.total_igst or 0),
                "total_cgst":  float(supply_instance.total_cgst or 0),
                "total_sgst":  float(supply_instance.total_sgst or 0),
                "total_cess":  float(supply_instance.total_cess or 0),
            }

        due_dict = {}
        if due_data_raw:
            due_dict = due_data_raw
        if due_instance:
            due_dict.update({
                "reverseTcs": due_instance.reverse_gst_tcs,
                "reverseTds": due_instance.reverse_gst_tds,
            })

        try:
            post_debit_note(
                debit_note_instance=instance,
                voucher_obj=voucher,
                supply_data=supply_dict,
                due_data=due_dict,
                payment_details=payment_details,
                tax_type=tax_type,
                company_pos=company_pos,
                tenant_id=tenant_id,
            )
        except ValueError as exc:
            # Validation-level errors (e.g., TDS+TCS both selected) surface to the API
            raise serializers.ValidationError(str(exc)) from exc
        except Exception as exc:
            # Non-critical posting errors are logged but don't block the save
            import logging
            logging.getLogger(__name__).error(
                "[DebitNoteSerializer] Posting pipeline error: %s", exc
            )

        return instance

    # ------------------------------------------------------------------
    # UPDATE
    # ------------------------------------------------------------------

    def update(self, instance, validated_data):
        supply_data     = validated_data.pop("supply_details", None)
        due_data_raw    = validated_data.pop("due_details", None)
        transit_data    = validated_data.pop("transit_details", None)
        payment_details = validated_data.pop("payment_details", []) or []
        company_pos     = validated_data.pop("company_pos", "") or ""

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        tenant_id = instance.tenant_id

        supply_instance = None
        if supply_data is not None:
            supply_instance, _ = VoucherDebitNoteSupplyDetails.objects.update_or_create(
                debit_note_details=instance,
                defaults={"tenant_id": tenant_id, **supply_data},
            )

        due_instance = None
        if due_data_raw is not None:
            due_instance, _ = VoucherDebitNoteDueDetails.objects.update_or_create(
                debit_note_details=instance,
                defaults={"tenant_id": tenant_id, **due_data_raw},
            )

        if transit_data is not None:
            VoucherDebitNoteTransitDetails.objects.update_or_create(
                debit_note_details=instance,
                defaults={"tenant_id": tenant_id, **transit_data},
            )

        # Update global Voucher
        try:
            voucher = Voucher.objects.get(
                type="debit_note",
                reference_id=instance.id,
                tenant_id=tenant_id,
            )
            if supply_instance:
                voucher.total_taxable_amount = supply_instance.total_taxable_value
                voucher.total_cgst           = supply_instance.total_cgst
                voucher.total_sgst           = supply_instance.total_sgst
                voucher.total_igst           = supply_instance.total_igst
                voucher.items_data           = supply_instance.items
            if due_instance:
                voucher.total = due_instance.net_amount_due
            voucher.date   = instance.date
            voucher.party  = instance.vendor_name
            voucher.save()
        except Voucher.DoesNotExist:
            voucher = None

        # Re-run posting pipeline on update (clear old entries first)
        if voucher:
            from .services.debit_note_service import determine_tax_type, post_debit_note
            from .models import JournalEntry

            JournalEntry.objects.filter(
                tenant_id=tenant_id,
                voucher_type="DEBIT_NOTE",
                voucher_id=voucher.id,
            ).delete()

            tax_type = determine_tax_type(
                nature_of_supply=instance.nature_of_supply or "Regular",
                pos=instance.place_of_supply or "",
                company_pos=company_pos,
            )

            supply_dict = {}
            if supply_instance:
                supply_dict = {
                    "items": supply_instance.items or [],
                    "total_taxable_value": float(supply_instance.total_taxable_value or 0),
                    "total_igst":  float(supply_instance.total_igst or 0),
                    "total_cgst":  float(supply_instance.total_cgst or 0),
                    "total_sgst":  float(supply_instance.total_sgst or 0),
                    "total_cess":  float(supply_instance.total_cess or 0),
                }

            due_dict = due_data_raw or {}
            if due_instance:
                due_dict.update({
                    "reverseTcs": due_instance.reverse_gst_tcs,
                    "reverseTds": due_instance.reverse_gst_tds,
                })

            try:
                post_debit_note(
                    debit_note_instance=instance,
                    voucher_obj=voucher,
                    supply_data=supply_dict,
                    due_data=due_dict,
                    payment_details=payment_details,
                    tax_type=tax_type,
                    company_pos=company_pos,
                    tenant_id=tenant_id,
                )
            except ValueError as exc:
                raise serializers.ValidationError(str(exc)) from exc
            except Exception as exc:
                import logging
                logging.getLogger(__name__).error(
                    "[DebitNoteSerializer] Update posting error: %s", exc
                )

>>>>>>> origin/main
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
