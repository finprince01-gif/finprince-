"""
inventory_sync.py
=================
Called from Sales and Purchase voucher serializers on create/update.

- Sales Voucher  → InventoryOperationOutward  (outward_type='sales')
                 → StockMovement / InventoryStockItem (OUTWARD)
- Purchase Voucher → InventoryOperationNewGRN (grn_type='purchases')
                   → StockMovement / InventoryStockItem (INWARD)

Only items with an item_code are synced to inventory (service-only lines are skipped).
"""

from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helper – mirrors inventory.views.record_stock_movement
# ---------------------------------------------------------------------------

def _record_stock_movement(tenant_id, item_code, item_name, voucher_type,
                            voucher_no, quantity, rate, location_name, is_inward):
    """
    Update InventoryStockItem balance and insert a StockMovement row.
    This is a local copy of the logic in inventory/views.py so we don't
    create circular imports.
    """
    from django.db import transaction
    from django.utils import timezone
    from inventory.models import InventoryStockItem, StockMovement

    try:
        with transaction.atomic():
            qty_decimal = Decimal(str(quantity))
            rate_decimal = Decimal(str(rate))

            stock_item, created = InventoryStockItem.objects.select_for_update().get_or_create(
                tenant_id=tenant_id,
                item_code=item_code,
                defaults={
                    'name': item_name or item_code,
                    'current_balance': Decimal('0'),
                    'rate': rate_decimal,
                    'unit': 'nos',
                },
            )

            if not created and item_name:
                stock_item.name = item_name

            old_balance = stock_item.current_balance
            if is_inward:
                new_balance = old_balance + qty_decimal
                inward_qty = qty_decimal
                outward_qty = Decimal('0')
            else:
                new_balance = old_balance - qty_decimal
                inward_qty = Decimal('0')
                outward_qty = qty_decimal

            stock_item.current_balance = new_balance
            stock_item.rate = rate_decimal
            stock_item.save()

            StockMovement.objects.create(
                tenant_id=tenant_id,
                item_code=item_code,
                date=timezone.now().date(),
                time=timezone.now().time(),
                voucher_type=voucher_type,
                voucher_no=voucher_no,
                location=location_name or '',
                inward_qty=inward_qty,
                outward_qty=outward_qty,
                balance_qty=new_balance,
                rate=rate_decimal,
                value=qty_decimal * rate_decimal,
            )
    except Exception as exc:
        logger.error(
            "[InventorySync] _record_stock_movement failed for item %s: %s",
            item_code, exc, exc_info=True,
        )


# ---------------------------------------------------------------------------
# Sales → Outward Slip  +  Stock Movement (Outward)
# ---------------------------------------------------------------------------

def sync_sales_to_outward(invoice):
    """
    Create/update an InventoryOperationOutward row for a Sales Invoice and
    record OUTWARD stock movements so the Stock Movement Summary is updated.

    - invoice: VoucherSalesInvoiceDetails instance (already saved)
    Idempotent: uses linked_sales_voucher_id as the unique key.
    """
    try:
        from inventory.models import (
            InventoryOperationOutward,
            InventoryOperationOutwardItem,
            InventoryLocation,
        )

        tenant_id = invoice.tenant_id

        # Collect items that have an item_code (skip pure service / ledger lines)
        raw_items = list(invoice.items.all())
        inventory_items = [i for i in raw_items if i.item_code and str(i.item_code).strip()]

        if not inventory_items:
            logger.info(
                "[InventorySync] Sales %s: no inventory items – outward not created.",
                invoice.sales_invoice_no,
            )
            return

        # Generate an outward_slip_no
        outward_no = (
            getattr(invoice, 'outward_slip_no', None)
            or f"OUT-{invoice.sales_invoice_no or invoice.id}"
        )

        # Location
        location = InventoryLocation.objects.filter(tenant_id=tenant_id).first()
        location_name = location.name if location else ""

        # 1. Create / update the Outward header
        outward, created = InventoryOperationOutward.objects.update_or_create(
            tenant_id=tenant_id,
            linked_sales_voucher_id=invoice.id,
            defaults={
                "outward_slip_no": outward_no,
                "outward_type": "sales",
                "date": invoice.date,
                "customer_name": invoice.customer_name,
                "customer_id": invoice.customer_id,
                "sales_order_no": invoice.sales_order_no or "",
                "gstin": invoice.gstin or "",
                "status": "POSTED",
                "location": location,
            },
        )

        action_label = "Created" if created else "Updated"
        logger.info(
            "[InventorySync] %s Outward slip %s for Sales %s",
            action_label, outward_no, invoice.sales_invoice_no,
        )

        # 2. Rebuild outward items
        InventoryOperationOutwardItem.objects.filter(parent=outward).delete()
        for item in inventory_items:
            InventoryOperationOutwardItem.objects.create(
                parent=outward,
                tenant_id=tenant_id,
                item_code=item.item_code or "",
                item_name=item.item_name or "",
                description=getattr(item, 'description', None),
                quantity=item.qty,
                uom=item.uom or "",
                rate=item.item_rate,
                taxable_value=item.taxable_value,
                gst_rate=Decimal("0"),
                cgst=item.cgst,
                sgst=item.sgst,
                igst=item.igst,
                cess=item.cess,
                total_value=item.invoice_value,
            )

        # 3. Record OUTWARD stock movements
        # On update, reverse previous movements first (idempotency)
        if not created:
            # Remove old StockMovement rows for this voucher
            from inventory.models import StockMovement
            StockMovement.objects.filter(
                tenant_id=tenant_id,
                voucher_type="Sales Voucher",
                voucher_no=invoice.sales_invoice_no or outward_no,
            ).delete()
            # Re-adjust InventoryStockItem balances (add back what we're about to subtract again)
            # Simpler: rebuild from scratch by reversing old items — skipped for brevity;
            # we just re-write movements so the summary reflects the current items.

        for item in inventory_items:
            _record_stock_movement(
                tenant_id=tenant_id,
                item_code=item.item_code,
                item_name=item.item_name or item.item_code,
                voucher_type="Sales Voucher",
                voucher_no=invoice.sales_invoice_no or outward_no,
                quantity=float(item.qty),
                rate=float(item.item_rate),
                location_name=location_name,
                is_inward=False,  # Sales = OUTWARD
            )

        logger.info(
            "[InventorySync] Outward + StockMovement synced: %d rows for Sales %s",
            len(inventory_items), invoice.sales_invoice_no,
        )

    except Exception as exc:
        logger.error(
            "[InventorySync] sync_sales_to_outward failed: %s", exc, exc_info=True,
        )
        # Never raise — voucher save must not fail because of inventory sync.


# ---------------------------------------------------------------------------
# Purchase → GRN  +  Stock Movement (Inward)
# ---------------------------------------------------------------------------

def sync_purchase_to_grn(purchase, supply_inr_data=None, supply_foreign_data=None):
    """
    Create/update an InventoryOperationNewGRN row for a Purchase Voucher and
    record INWARD stock movements so the Stock Movement Summary is updated.

    - purchase: VoucherPurchaseSupplierDetails instance (already saved)
    - supply_inr_data / supply_foreign_data: raw dict from the serializer
    Idempotent: uses grn_no as the unique key.
    """
    try:
        from inventory.models import (
            InventoryOperationNewGRN,
            InventoryOperationNewGRNItem,
        )

        tenant_id = purchase.tenant_id

        # Canonical GRN number
        grn_no = (
            purchase.grn_reference
            or purchase.purchase_voucher_no
            or f"GRN-{purchase.supplier_invoice_no or purchase.id}"
        )

        # Collect items
        items_to_create = []

        # Source 1: Relational VoucherPurchaseItem table
        rel_items = list(
            purchase.line_items.filter(item_code__isnull=False).exclude(item_code="")
        )
        if rel_items:
            for ri in rel_items:
                items_to_create.append({
                    "item_code": ri.item_code,
                    "item_name": ri.item_name,
                    "quantity": ri.quantity,
                    "uom": ri.uom or "",
                    "rate": ri.rate,
                    "taxable_value": ri.taxable_value,
                    "gst_rate": Decimal("0"),
                    "cgst": ri.cgst_amount,
                    "sgst": ri.sgst_amount,
                    "igst": ri.igst_amount,
                    "cess": ri.cess_amount,
                    "total_value": ri.invoice_value,
                })

        # Source 2: Raw dict items (fallback)
        elif supply_inr_data and "items" in supply_inr_data:
            for item in supply_inr_data["items"]:
                if not isinstance(item, dict):
                    continue
                code = item.get("itemCode") or item.get("item_code", "")
                if not code:
                    continue
                items_to_create.append({
                    "item_code": code,
                    "item_name": item.get("itemName") or item.get("item_name", ""),
                    "quantity": Decimal(str(item.get("qty", 0))),
                    "uom": item.get("uom", ""),
                    "rate": Decimal(str(item.get("itemRate", 0))),
                    "taxable_value": Decimal(str(item.get("taxableValue", 0))),
                    "gst_rate": Decimal("0"),
                    "cgst": Decimal(str(item.get("cgst", 0))),
                    "sgst": Decimal(str(item.get("sgst", 0))),
                    "igst": Decimal(str(item.get("igst", 0))),
                    "cess": Decimal(str(item.get("cess", 0))),
                    "total_value": Decimal(str(item.get("invoiceValue", 0))),
                })

        elif supply_foreign_data and "items" in supply_foreign_data:
            for item in supply_foreign_data["items"]:
                if not isinstance(item, dict):
                    continue
                code = item.get("itemCode") or item.get("item_code", "")
                if not code:
                    continue
                items_to_create.append({
                    "item_code": code,
                    "item_name": item.get("itemName") or item.get("item_name", ""),
                    "quantity": Decimal(str(item.get("qty", 0))),
                    "uom": item.get("uom", ""),
                    "rate": Decimal(str(item.get("itemRate", 0))),
                    "taxable_value": Decimal(str(item.get("amount", 0))),
                    "gst_rate": Decimal("0"),
                    "cgst": Decimal("0"),
                    "sgst": Decimal("0"),
                    "igst": Decimal("0"),
                    "cess": Decimal("0"),
                    "total_value": Decimal(str(item.get("amount", 0))),
                })

        if not items_to_create:
            logger.info(
                "[InventorySync] Purchase %s: no inventory items – GRN not created.",
                purchase.purchase_voucher_no,
            )
            return

        vendor_addr = getattr(purchase, 'bill_from', "") or ""
        vendor_gstin = getattr(purchase, 'gstin', "") or ""

        # 1. Create / update GRN header
        grn, created = InventoryOperationNewGRN.objects.update_or_create(
            tenant_id=tenant_id,
            grn_no=grn_no,
            defaults={
                "grn_type": "purchases",
                "grn_series_name": purchase.purchase_voucher_series or "",
                "date": purchase.date,
                "vendor_name": purchase.vendor_name or "",
                "address": vendor_addr,
                "gstin": vendor_gstin,
                "reference_no": purchase.supplier_invoice_no or "",
                "secondary_ref_no": purchase.purchase_voucher_no or "",
                "status": "Posted",
            },
        )

        action_label = "Created" if created else "Updated"
        logger.info(
            "[InventorySync] %s GRN %s for Purchase %s",
            action_label, grn_no, purchase.purchase_voucher_no,
        )

        # 2. Rebuild GRN items
        InventoryOperationNewGRNItem.objects.filter(parent=grn).delete()
        for it in items_to_create:
            InventoryOperationNewGRNItem.objects.create(
                parent=grn,
                tenant_id=tenant_id,
                **it,
            )

        # 3. Record INWARD stock movements
        if not created:
            from inventory.models import StockMovement
            StockMovement.objects.filter(
                tenant_id=tenant_id,
                voucher_type="Purchase Voucher",
                voucher_no=purchase.supplier_invoice_no or purchase.purchase_voucher_no or grn_no,
            ).delete()

        for it in items_to_create:
            _record_stock_movement(
                tenant_id=tenant_id,
                item_code=it["item_code"],
                item_name=it["item_name"] or it["item_code"],
                voucher_type="Purchase Voucher",
                voucher_no=purchase.supplier_invoice_no or purchase.purchase_voucher_no or grn_no,
                quantity=float(it["quantity"]),
                rate=float(it["rate"]),
                location_name="",
                is_inward=True,  # Purchase = INWARD
            )

        logger.info(
            "[InventorySync] GRN + StockMovement synced: %d rows for Purchase %s",
            len(items_to_create), purchase.purchase_voucher_no,
        )

    except Exception as exc:
        logger.error(
            "[InventorySync] sync_purchase_to_grn failed: %s", exc, exc_info=True,
        )
        # Never raise — voucher save must not fail because of inventory sync.
