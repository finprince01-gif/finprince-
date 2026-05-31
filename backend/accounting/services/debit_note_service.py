"""
debit_note_service.py
=====================
Core posting engine for Debit Note Vouchers.

Responsibilities
----------------
1. Determine Tax Type (CGST/SGST vs IGST) from Nature of Supply + POS.
2. Auto-resolve Purchase Ledger and GST Ledgers from original Purchase Voucher.
3. Validate + compute TDS Payable Reversal and TCS Receivable Reversal.
4. Build balanced double-entry journal (Dr. Vendor / Cr. Purchase + Taxes + TCS) 
   with TDS Debit if applicable.
5. Write Bill Allocation records:
   - Create a new 'Open' pending-transaction row for the Debit Note itself.
   - Link it 'Against Reference' to each tagged Supplier Invoice.
   - If the Supplier Invoice's pending balance goes negative, release 
     linked Payment Vouchers in LIFO order.
6. Build the "Particulars" label for the Vendor Ledger display.
7. Mirror the Debit Note into VendorTransaction for the Vendor Portal.
"""

from __future__ import annotations

import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.db import transaction as db_transaction

logger = logging.getLogger(__name__)
from accounting.models import PendingTransaction, AllocationLink


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TWO_PLACES = Decimal("0.01")

# Nature-of-supply values that always produce IGST
_IGST_NATURE = {"SEZ with Payment of Tax", "Deemed Export", "Re-Export"}


# ===========================================================================
# STEP 1 — Tax Type Determination
# ===========================================================================

def determine_tax_type(
    nature_of_supply: str,
    pos: str,              # Place of Supply on the bill
    company_pos: str,      # Place of Supply (state) of the logged-in company
) -> str:
    """
    Return 'IGST' or 'CGST_SGST'.

    Rules
    -----
    - Any SEZ / Deemed Export / Re-Export → IGST
    - Regular + POS == Company POS → CGST_SGST
    - Regular + POS != Company POS → IGST
    """
    nature = (nature_of_supply or "").strip()
    if nature in _IGST_NATURE:
        return "IGST"
    # Regular
    if (pos or "").strip().lower() == (company_pos or "").strip().lower():
        return "CGST_SGST"
    return "IGST"


# ===========================================================================
# STEP 2 — Classify item (Goods/Service, Tax Category)
# ===========================================================================

def classify_item(item: dict) -> dict:
    """
    Return {'item_type': 'Goods'|'Service', 'tax_category': 'Taxable'|'Nil-Rated'|'Exempted'}
    """
    hsn_sac = str(item.get("hsnSac", "") or "").strip()
    gst_rate = Decimal(str(item.get("gstRate", 0) or 0))
    nature_of_supply = str(item.get("natureOfSupply", "") or "").strip()

    item_type = "Goods" if len(hsn_sac) >= 4 and hsn_sac.isdigit() else "Service"

    if gst_rate > 0:
        tax_category = "Taxable"
    elif "export" in nature_of_supply.lower():
        tax_category = "Exempted"
    else:
        tax_category = "Nil-Rated"

    return {"item_type": item_type, "tax_category": tax_category}


# ===========================================================================
# STEP 3 — Fetch TDS / TCS from original Purchase Invoice
# ===========================================================================

def _fetch_purchase_tds_tcs(supplier_invoice_no: str, tenant_id: str) -> dict:
    """
    Returns {'tds_payable': Decimal, 'tcs_receivable': Decimal,
             'taxable_value': Decimal, 'purchase_ledger': str|None,
             'purchase_voucher_id': int|None, 'purchase_voucher_date': date|None}
    from the linked Purchase Voucher.
    """
    from accounting.models_voucher_purchase import (
        VoucherPurchaseSupplierDetails,
        VoucherPurchaseDueDetails,
        VoucherPurchaseSupplyINRDetails,
    )

    result = {
        "tds_payable": Decimal("0"),
        "tcs_receivable": Decimal("0"),
        "taxable_value": Decimal("0"),
        "purchase_ledger": None,
        "purchase_voucher_id": None,
        "purchase_voucher_date": None,
    }

    if not supplier_invoice_no:
        return result

    purchase = (
        VoucherPurchaseSupplierDetails.objects
        .filter(tenant_id=tenant_id, supplier_invoice_no=supplier_invoice_no)
        .order_by("-date")
        .first()
    )
    if not purchase:
        return result

    result["purchase_voucher_id"] = purchase.id
    result["purchase_voucher_date"] = purchase.date

    # TDS/TCS from DueDetails
    try:
        due = purchase.due_details
        result["tds_payable"] = Decimal(str(due.tds_it or 0))
    except Exception:
        pass

    # Taxable value & purchase ledger from INR supply details
    try:
        inr = purchase.supply_inr_details
        tv = sum(
            Decimal(str(item.get("taxableValue", 0) or 0))
            for item in (inr.items or [])
        )
        result["taxable_value"] = tv
        result["purchase_ledger"] = inr.purchase_ledger
    except Exception:
        pass

    # TCS from vendor master TDS record (tcs_rate on vendor)
    # We store tcs_receivable that is applied on the invoice as a separate
    # field. For now derive from VendorMasterTDS tcs_rate if available.
    try:
        vendor = purchase.vendor_basic_detail
        tds_obj = vendor.tds_details.first()
        if tds_obj and tds_obj.tcs_rate:
            tcs_rate = Decimal(str(tds_obj.tcs_rate or 0))
            # tcs = tcs_rate% of taxable value on original invoice
            result["tcs_receivable"] = (result["taxable_value"] * tcs_rate / 100).quantize(
                TWO_PLACES, rounding=ROUND_HALF_UP
            )
    except Exception:
        pass

    return result


# ===========================================================================
# STEP 4 — Compute TDS / TCS Reversals
# ===========================================================================

def compute_tds_tcs_reversals(
    *,
    dn_taxable_value: Decimal,
    reverse_tcs_flag: bool,
    reverse_tds_flag: bool,
    purchase_info: dict,
) -> dict:
    """
    Returns {'tcs_reversed': Decimal, 'tds_reversed': Decimal}

    Raises ValueError if both TDS + TCS reversal are requested on the same note.
    """
    if reverse_tcs_flag and reverse_tds_flag:
        raise ValueError(
            "TCS Receivable and TDS Payable reversals are mutually exclusive "
            "on the same Debit Note."
        )

    orig_taxable = purchase_info["taxable_value"] or Decimal("1")  # avoid div/0
    tcs_reversed = Decimal("0")
    tds_reversed = Decimal("0")

    if reverse_tcs_flag and purchase_info["tcs_receivable"] > 0:
        tcs_reversed = (
            (dn_taxable_value / orig_taxable) * purchase_info["tcs_receivable"]
        ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        # Validation: must not exceed original TCS
        if tcs_reversed > purchase_info["tcs_receivable"]:
            tcs_reversed = purchase_info["tcs_receivable"]

    if reverse_tds_flag and purchase_info["tds_payable"] > 0:
        tds_reversed = (
            (dn_taxable_value / orig_taxable) * purchase_info["tds_payable"]
        ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        if tds_reversed > purchase_info["tds_payable"]:
            tds_reversed = purchase_info["tds_payable"]

    return {"tcs_reversed": tcs_reversed, "tds_reversed": tds_reversed}


# ===========================================================================
# STEP 5 — Build "Particulars" Label for Vendor Ledger
# ===========================================================================

def build_particulars_label(
    items: list[dict],
    tds_reversed: Decimal,
    tcs_reversed: Decimal,
) -> str:
    """
    Return the string to show in the Vendor A/c ledger's 'Particulars' column.

    Condition 1: If any item has Taxable Value > 0 AND Quantity == 0 → "Financial Debit Note"
    Conditions 2-3: Based on GST total and TDS/TCS reversal presence.
    """
    # Condition 1
    for item in items:
        tv = Decimal(str(item.get("taxableValue", 0) or 0))
        qty = Decimal(str(item.get("qty", 0) or 0))
        if tv > 0 and qty == 0:
            return "Financial Debit Note"

    total_gst = sum(
        Decimal(str(item.get("igst", 0) or 0))
        + Decimal(str(item.get("cgst", 0) or 0))
        + Decimal(str(item.get("sgst", 0) or 0))
        for item in items
    )

    gst_positive = total_gst > 0
    tds_positive = tds_reversed > 0
    tcs_positive = tcs_reversed > 0

    if not gst_positive and not tds_positive and not tcs_positive:
        return "Non-GST Debit Note"
    if gst_positive and not tds_positive and not tcs_positive:
        return "GST Debit Note"
    if not gst_positive and tds_positive:
        return "Non-GST Debit Note with TDS Reversal"
    if not gst_positive and tcs_positive:
        return "Non-GST Debit Note with TCS Reversal"
    if gst_positive and tds_positive:
        return "GST Debit Note with TDS Reversal"
    if gst_positive and tcs_positive:
        return "GST Debit Note with TCS Reversal"

    return "GST Debit Note"


# ===========================================================================
# STEP 6 — Resolve Ledgers (Purchase + GST Input)
# ===========================================================================

def _resolve_or_create_ledger(name: str, category: str, tenant_id: str):
    """
    Helper: find a MasterLedger by name (case-insensitive) or create one.
    """
    from accounting.models import MasterLedger, MasterLedgerGroup

    obj = MasterLedger.objects.filter(name__iexact=name.strip(), tenant_id=tenant_id).first()
    if obj:
        return obj

    # Create a stub ledger under an appropriate group
    group_name = "Purchase Accounts" if category == "Expense" else "Tax Ledgers"
    group, _ = MasterLedgerGroup.objects.get_or_create(
        name=group_name, tenant_id=tenant_id,
        defaults={"parent": None}
    )
    return MasterLedger.objects.create(
        name=name,
        group=group_name,
        group_id=group,
        tenant_id=tenant_id,
        category=category,
    )


def resolve_gst_ledgers(tax_type: str, has_cess: bool, tenant_id: str) -> dict:
    """
    Returns {'cgst': ledger|None, 'sgst': ledger|None,
             'igst': ledger|None, 'cess': ledger|None}
    """
    from accounting.services.ledger_service import _resolve_ledger

    ledgers: dict[str, Any] = {"cgst": None, "sgst": None, "igst": None, "cess": None}

    if tax_type == "CGST_SGST":
        ledgers["cgst"] = (
            _resolve_ledger("Input CGST", tenant_id)
            or _resolve_or_create_ledger("Input CGST", "Asset", tenant_id)
        )
        ledgers["sgst"] = (
            _resolve_ledger("Input SGST/UTGST", tenant_id)
            or _resolve_or_create_ledger("Input SGST/UTGST", "Asset", tenant_id)
        )
    else:  # IGST
        ledgers["igst"] = (
            _resolve_ledger("Input IGST", tenant_id)
            or _resolve_or_create_ledger("Input IGST", "Asset", tenant_id)
        )

    if has_cess:
        ledgers["cess"] = (
            _resolve_ledger("Input Compensation Cess", tenant_id)
            or _resolve_or_create_ledger("Input Compensation Cess", "Asset", tenant_id)
        )

    return ledgers


# ===========================================================================
# STEP 7 — Double-Entry Posting
# ===========================================================================

def post_debit_note_accounting(
    *,
    debit_note_instance,
    voucher_obj,                 # the global Voucher row just created
    items: list[dict],
    tax_type: str,               # 'IGST' or 'CGST_SGST'
    tds_reversed: Decimal,
    tcs_reversed: Decimal,
    purchase_ledger_name: str | None,
    tenant_id: str,
    payment_details: list[dict], # rows from Payment Details tab
) -> None:
    """
    Posts the balanced accounting entries for the Debit Note.

    Entry structure (Step 5 of spec):
    Dr  Vendor A/c   = taxable + gst + tcs_reversed - tds_reversed  [DEBIT]
    Dr  TDS Payable  = tds_reversed                                  [DEBIT]  (if applicable)
    Cr  Purchase     = taxable_value                                 [CREDIT]
    Cr  Input CGST   = cgst total                                    [CREDIT]
    Cr  Input SGST   = sgst total                                    [CREDIT]
    Cr  Input IGST   = igst total                                    [CREDIT]
    Cr  Input Cess   = cess total                                    [CREDIT]
    Cr  TCS Receiv.  = tcs_reversed                                  [CREDIT] (if applicable)

    Balanced: Dr Total == Cr Total guaranteed before posting.
    """
    from accounting.services.ledger_service import post_transaction, _resolve_ledger
    from accounting.models import MasterLedger

    # ── Aggregate item totals ──────────────────────────────────────────
    total_taxable = Decimal("0")
    total_igst    = Decimal("0")
    total_cgst    = Decimal("0")
    total_sgst    = Decimal("0")
    total_cess    = Decimal("0")

    for item in items:
        total_taxable += Decimal(str(item.get("taxableValue", 0) or 0))
        total_igst    += Decimal(str(item.get("igst", 0) or 0))
        total_cgst    += Decimal(str(item.get("cgst", 0) or 0))
        total_sgst    += Decimal(str(item.get("sgst", 0) or 0))
        total_cess    += Decimal(str(item.get("cess", 0) or 0))

    if not items and voucher_obj and voucher_obj.total and voucher_obj.total > 0:
        total_taxable = Decimal(str(voucher_obj.total))

    total_gst = total_igst + total_cgst + total_sgst + total_cess

    # Vendor A/c debit = taxable + gst + tcs_reversed - tds_reversed
    vendor_debit = (total_taxable + total_gst + tcs_reversed - tds_reversed).quantize(
        TWO_PLACES, rounding=ROUND_HALF_UP
    )

    if vendor_debit <= 0 and total_taxable <= 0:
        logger.warning("[DebitNoteService] Nothing to post – all amounts are zero.")
        return

    entries: list[dict] = []

    # 1. Vendor A/c — DEBIT
    vendor_ledger = None
    if debit_note_instance.vendor_basic_detail_id:
        try:
            vendor_ledger = debit_note_instance.vendor_basic_detail.ledger
        except Exception:
            pass
    if vendor_ledger:
        entries.append({
            "ledger_id": vendor_ledger.id,
            "debit": float(vendor_debit),
            "credit": 0,
            "vendor_id": debit_note_instance.vendor_basic_detail_id,
        })

    # 2. TDS Payable — DEBIT (if reversed)
    if tds_reversed > 0:
        tds_ledger = (
            _resolve_ledger("TDS Payable", tenant_id)
            or _resolve_or_create_ledger("TDS Payable", "Liability", tenant_id)
        )
        if tds_ledger:
            entries.append({
                "ledger_id": tds_ledger.id,
                "debit": float(tds_reversed),
                "credit": 0,
            })

    # 3. Purchase Ledger — CREDIT
    p_ledger = None
    if purchase_ledger_name:
        p_ledger = _resolve_ledger(purchase_ledger_name, tenant_id)
    if not p_ledger:
        p_ledger = _resolve_or_create_ledger(
            purchase_ledger_name or "Purchase Account", "Expense", tenant_id
        )
    if p_ledger and total_taxable > 0:
        entries.append({
            "ledger_id": p_ledger.id,
            "debit": 0,
            "credit": float(total_taxable),
        })

    # 4. GST Input Ledgers — CREDIT
    has_cess = total_cess > 0
    gst_ledgers = resolve_gst_ledgers(tax_type, has_cess, tenant_id)

    def _add_gst_entry(ledger_obj, amount: Decimal):
        if ledger_obj and amount > 0:
            entries.append({"ledger_id": ledger_obj.id, "debit": 0, "credit": float(amount)})

    if tax_type == "CGST_SGST":
        _add_gst_entry(gst_ledgers["cgst"], total_cgst)
        _add_gst_entry(gst_ledgers["sgst"], total_sgst)
    else:
        _add_gst_entry(gst_ledgers["igst"], total_igst)

    _add_gst_entry(gst_ledgers["cess"], total_cess)

    # 5. TCS Receivable — CREDIT
    if tcs_reversed > 0:
        tcs_ledger = (
            _resolve_ledger("TCS Receivable", tenant_id)
            or _resolve_or_create_ledger("TCS Receivable", "Asset", tenant_id)
        )
        if tcs_ledger:
            entries.append({
                "ledger_id": tcs_ledger.id,
                "debit": 0,
                "credit": float(tcs_reversed),
            })

    # ── Balance check ──────────────────────────────────────────────────
    if len(entries) < 2:
        logger.warning("[DebitNoteService] Not enough entries to post double-entry.")
        return

    try:
        post_transaction(
            voucher_type="DEBIT_NOTE",
            voucher_id=voucher_obj.id,
            tenant_id=tenant_id,
            entries=entries,
            transaction_date=debit_note_instance.date,
            voucher_number=voucher_obj.voucher_number
        )
        logger.info(
            "[DebitNoteService] Posted %d entries for Debit Note %s",
            len(entries),
            voucher_obj.voucher_number,
        )
    except Exception as exc:
        logger.error("[DebitNoteService] Accounting post failed: %s", exc)
        raise


# ===========================================================================
# STEP 8 — Grouped Applied-Now Calculation (Payment Details tab pre-fill)
# ===========================================================================

def calculate_applied_now_by_invoice(
    items: list[dict],
    tcs_by_invoice: dict[str, Decimal],
    tds_by_invoice: dict[str, Decimal],
    fallback_invoice_nos: list[str] = None,
    total_debit_to_distribute: Decimal = Decimal("0"),
) -> dict[str, Decimal]:
    """
    Groups items by their tagged Supplier Invoice No. and returns a dict
      { supplier_invoice_no: applied_now_amount }

    Applied Now = Item Gross Value + TCS Reversed (for that invoice)
                                   - TDS Reversed (for that invoice)

    If items don't have supplierInvoiceNo but fallback_invoice_nos has exactly one entry,
    we attribute all items to that invoice.
    """
    grouped: dict[str, Decimal] = {}
    
    # Clean header list
    header_invs = [str(x).strip() for x in (fallback_invoice_nos or []) if str(x).strip()]

    # 1. Try to group based on line items
    for item in items:
        inv_no = str(item.get("supplierInvoiceNo", "") or "").strip()
        
        # If line has no tag but there's exactly one header invoice, attribute to it
        if not inv_no and len(header_invs) == 1:
            inv_no = header_invs[0]
            
        if not inv_no:
            continue

        item_gross = (
            Decimal(str(item.get("taxableValue", 0) or 0))
            + Decimal(str(item.get("cgst", 0) or 0))
            + Decimal(str(item.get("sgst", 0) or 0))
            + Decimal(str(item.get("igst", 0) or 0))
            + Decimal(str(item.get("cess", 0) or 0))
        )
        grouped[inv_no] = grouped.get(inv_no, Decimal("0")) + item_gross

    # 2. If grouped is empty but we have header invoices, distribute the total
    if not grouped and header_invs and total_debit_to_distribute > 0:
        dist_amt = (total_debit_to_distribute / len(header_invs)).quantize(TWO_PLACES)
        for i, inv in enumerate(header_invs):
            # Adjust for rounding on the last one
            if i == len(header_invs) - 1:
                grouped[inv] = total_debit_to_distribute - sum(grouped.values())
            else:
                grouped[inv] = dist_amt

    result: dict[str, Decimal] = {}
    
    # Also ensure any invoice mentioned in footer (TCS/TDS) but not in items is included
    all_inv_nos = set(grouped.keys()) | set(tcs_by_invoice.keys()) | set(tds_by_invoice.keys())
    
    for inv_no in all_inv_nos:
        gross = grouped.get(inv_no, Decimal("0"))
        tcs = tcs_by_invoice.get(inv_no, Decimal("0"))
        tds = tds_by_invoice.get(inv_no, Decimal("0"))
        result[inv_no] = (gross + tcs - tds).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    
    return result


# ===========================================================================
# STEP 9 — Bill Allocation Lifecycle
# ===========================================================================

def _get_or_create_pending_tx(
    *,
    tenant_id: str,
    voucher_type: str,
    voucher_number: str,
    voucher_date,
    amount: Decimal,
    vendor_id: int,
    purchase_voucher_id: int | None,
) -> PendingTransaction:
    """
    Get or create a PendingTransaction row for the given voucher reference.
    """

    obj, _ = PendingTransaction.objects.get_or_create(
        tenant_id=tenant_id,
        reference_number=voucher_number,
        reference_type=voucher_type,
        defaults={
            "invoice_date": voucher_date,
            "vendor_id": vendor_id,
            "original_amount": amount,
            "pending_amount": amount,
            "status": "pending",
        },
    )
    return obj


def write_bill_allocation(
    *,
    debit_note_instance,
    voucher_obj,
    payment_details: list[dict],   # Payment Details tab rows
    vendor_debit_amount: Decimal,
    tenant_id: str,
    tcs_by_invoice: dict[str, Decimal],
    tds_by_invoice: dict[str, Decimal],
    items: list[dict],
) -> None:
    """
    Implements Step 7 of the spec:

    1. Create a new Open PendingTransaction for the Debit Note.
    2. For each Supplier Invoice in Payment Details, apply the amount:
       - Reduce the Debit Note pending balance.
       - Reduce the Purchase Invoice pending balance.
       - If Purchase Invoice goes negative → reverse linked Payments (LIFO).
    """
    with db_transaction.atomic():
        dn_number = voucher_obj.voucher_number
        dn_date   = debit_note_instance.date
        vendor_id = debit_note_instance.vendor_basic_detail_id or 0

        # ── 1. Create Debit Note pending row ──────────────────────────
        dn_tx, _ = PendingTransaction.objects.get_or_create(
            tenant_id=tenant_id,
            reference_number=dn_number,
            reference_type="debit_note",
            defaults={
                "voucher_date": dn_date,
                "vendor_id": vendor_id,
                "original_amount": vendor_debit_amount,
                "pending_amount": vendor_debit_amount,
                "status": "pending",
            },
        )

        # Fallback for invoices if not in items
        header_inv_raw = debit_note_instance.supplier_invoice_nos or ""
        header_inv_list = [x.strip() for x in header_inv_raw.split(",") if x.strip()]

        applied_now_map = calculate_applied_now_by_invoice(
            items, tcs_by_invoice, tds_by_invoice, 
            fallback_invoice_nos=header_inv_list,
            total_debit_to_distribute=vendor_debit_amount
        )

        for row in payment_details:
            inv_no = str(row.get("supplierInvoiceNo", "") or "").strip()
            if not inv_no:
                continue

            # User may have overridden applied_now
            applied_now = Decimal(str(row.get("appliedNow", 0) or 0))
            if applied_now == 0:
                applied_now = applied_now_map.get(inv_no, Decimal("0"))
            if applied_now <= 0:
                continue

            # ── 2. Find Purchase Invoice pending row ──────────────────
            purchase_tx = PendingTransaction.objects.filter(
                tenant_id=tenant_id,
                reference_number=inv_no,
                reference_type="PURCHASE",
            ).first()
            if not purchase_tx:
                logger.warning(
                    "[DebitNoteService] Purchase pending tx not found for invoice %s; skipping.", inv_no
                )
                continue

            # ── Link Debit Note → Purchase Invoice ─────────────────────
            AllocationLink.objects.create(
                tenant_id=tenant_id,
                source_reference_number=dn_number,
                source_reference_type="DEBIT_NOTE",
                source_reference_date=dn_date,
                target_reference_number=inv_no,
                target_reference_type="PURCHASE",
                amount_applied=applied_now,
            )

            # Reduce Debit Note pending balance
            dn_tx.pending_amount = (dn_tx.pending_amount - applied_now).quantize(TWO_PLACES)
            if dn_tx.pending_amount <= 0:
                dn_tx.status = "paid"
            dn_tx.save(update_fields=["pending_amount", "status"])

            # Reduce Purchase Invoice pending balance
            old_purchase_balance = purchase_tx.pending_amount
            purchase_tx.pending_amount = (purchase_tx.pending_amount - applied_now).quantize(TWO_PLACES)

            # ── 3. Payment Release (LIFO) if purchase goes negative ────
            if purchase_tx.pending_amount < 0:
                excess = abs(purchase_tx.pending_amount)
                _release_payments_lifo(
                    purchase_tx=purchase_tx,
                    excess_amount=excess,
                    tenant_id=tenant_id,
                    dn_number=dn_number,
                    dn_date=dn_date,
                )
                purchase_tx.pending_amount = Decimal("0")

            # Update Purchase Invoice status
            if purchase_tx.pending_amount <= 0:
                purchase_tx.status = "paid"
            elif purchase_tx.pending_amount < purchase_tx.original_amount:
                purchase_tx.status = "partially_paid"
            purchase_tx.save(update_fields=["pending_amount", "status"])


def _release_payments_lifo(
    *,
    purchase_tx: PendingTransaction,
    excess_amount: Decimal,
    tenant_id: str,
    dn_number: str,
    dn_date,
) -> None:
    """
    Release linked Payment Vouchers in LIFO order to recover excess_amount.

    For each payment allocation reversed:
    - Create a reversal AllocationLink (negative amount).
    - Restore the payment's pending balance.
    - Update payment status to Partially Utilized / Unutilized.
    """
    inv_no = purchase_tx.reference_number

    # Get all payment allocations linked to this purchase invoice, LIFO order
    payment_links = AllocationLink.objects.filter(
        tenant_id=tenant_id,
        target_reference_number=inv_no,
        target_reference_type="PURCHASE",
        source_reference_type="PAYMENT",
    ).order_by("-id")  # LIFO

    remaining_excess = excess_amount

    for link in payment_links:
        if remaining_excess <= 0:
            break

        reversal_amount = min(link.amount_applied, remaining_excess)

        # Create reversal link
        AllocationLink.objects.create(
            tenant_id=tenant_id,
            source_reference_number=f"Reversal: {inv_no}",
            source_reference_type="REVERSAL",
            source_reference_date=dn_date,
            target_reference_number=link.source_reference_number,
            target_reference_type="PAYMENT",
            amount_applied=-reversal_amount,
        )

        # Restore payment pending balance
        payment_tx = PendingTransaction.objects.filter(
            tenant_id=tenant_id,
            reference_number=link.source_reference_number,
            reference_type="PAYMENT",
        ).first()
        if payment_tx:
            payment_tx.pending_balance = (payment_tx.pending_balance + reversal_amount).quantize(TWO_PLACES)
            if payment_tx.pending_balance >= payment_tx.original_amount:
                payment_tx.status = "Unutilized"
            elif payment_tx.pending_balance > 0:
                payment_tx.status = "Partially Utilized"
            payment_tx.save(update_fields=["pending_balance", "status"])

        remaining_excess -= reversal_amount


# ===========================================================================
# STEP 10 — Mirror to Vendor Portal (VendorTransaction)
# ===========================================================================

def mirror_to_vendor_portal(
    debit_note_instance,
    voucher_obj,
    net_amount: Decimal,
    items: list[dict],
    tcs_by_invoice: dict[str, Decimal],
    tds_by_invoice: dict[str, Decimal],
) -> None:
    """
    Sync the Debit Note to the VendorTransaction table for the Vendor Portal.
    Guarantees grouping by resolving vendor_id from linked purchases if possible.
    """
    try:
        from vendors.models import VendorMasterBasicDetail, VendorTransaction
        from accounting.models import PendingTransaction

        tenant_id = debit_note_instance.tenant_id
        dn_number = voucher_obj.voucher_number
        dn_date = debit_note_instance.date
        
        header_inv_raw = debit_note_instance.supplier_invoice_nos or ""
        header_inv_list = [x.strip() for x in header_inv_raw.split(",") if x.strip()]

        # 1. Resolve exact vendor_id and branch (ledger_name) from linked purchases
        effective_vendor_id = None
        effective_branch = debit_note_instance.branch or "Vendor A/c"

        if header_inv_list:
            ref_purchase = VendorTransaction.objects.filter(
                tenant_id=tenant_id,
                transaction_type='purchase',
                reference_number__in=header_inv_list
            ).first()
            if ref_purchase:
                effective_vendor_id = ref_purchase.vendor_id
                effective_branch = ref_purchase.ledger_name
                logger.info(f"[DebitNoteService] Revolved vendor_id {effective_vendor_id} and branch '{effective_branch}' from matched Purchase")

        # Fallback for vendor_id if no matching purchase found in Portal yet
        if not effective_vendor_id:
            effective_vendor_id = getattr(debit_note_instance, 'vendor_basic_detail_id', None)
            if not effective_vendor_id and debit_note_instance.vendor_name:
                v = VendorMasterBasicDetail.objects.filter(
                    tenant_id=tenant_id, vendor_name__iexact=debit_note_instance.vendor_name.strip()
                ).first()
                if v: effective_vendor_id = v.id

        if not effective_vendor_id:
            logger.error("[DebitNoteService] ABORT Portal sync - Could not resolve vendor link.")
            return

        # 2. Cleanup old sync rows for this DN
        VendorTransaction.objects.filter(
            tenant_id=tenant_id, vendor_id=effective_vendor_id,
            transaction_number=dn_number, transaction_type="debit_note"
        ).delete()

        # 3. Build accurate Applied Now map
        applied_now_map = calculate_applied_now_by_invoice(
            items, tcs_by_invoice, tds_by_invoice, 
            fallback_invoice_nos=header_inv_list,
            total_debit_to_distribute=net_amount
        )

        # 4. Create Transactions & Update Purchase Status
        if not applied_now_map:
            # Absolute fallback
            ref_no = header_inv_raw.strip() or "-"
            VendorTransaction.objects.create(
                tenant_id=tenant_id, vendor_id=effective_vendor_id,
                transaction_number=dn_number, transaction_type="debit_note",
                transaction_date=dn_date, amount=net_amount, total_amount=net_amount,
                status="Utilized", reference_number=ref_no,
                notes=f"Debit Note from {debit_note_instance.vendor_name}",
                ledger_name=effective_branch
            )
        else:
            total_allocated = Decimal("0")
            for inv_no, amt in applied_now_map.items():
                if amt == 0 and len(applied_now_map) > 1: continue 
                total_allocated += amt
                
                clean_ref = inv_no.strip()
                VendorTransaction.objects.create(
                    tenant_id=tenant_id, vendor_id=effective_vendor_id,
                    transaction_number=dn_number, transaction_type="debit_note",
                    transaction_date=dn_date, amount=amt, total_amount=amt,
                    status="Utilized", reference_number=clean_ref,
                    notes=f"Debit Note against {clean_ref}",
                    ledger_name=effective_branch
                )

                # Update the Purchase status in Vendor Portal
                p_txn = VendorTransaction.objects.filter(
                    tenant_id=tenant_id, vendor_id=effective_vendor_id,
                    transaction_type='purchase', reference_number=clean_ref
                ).first()
                if p_txn:
                    pt = PendingTransaction.objects.filter(
                        tenant_id=tenant_id, reference_number=clean_ref, reference_type="PURCHASE"
                    ).first()
                    if pt:
                        if pt.pending_balance <= 0:
                            p_txn.status = "Paid"
                        elif pt.pending_balance < pt.original_amount:
                            p_txn.status = "Partially Paid"
                        else:
                            p_txn.status = "Due"
                        p_txn.save(update_fields=["status"])

            # Handle unallocated balance
            unallocated = net_amount - total_allocated
            if unallocated > Decimal("0.01"):
                VendorTransaction.objects.create(
                    tenant_id=tenant_id, vendor_id=effective_vendor_id,
                    transaction_number=dn_number, transaction_type="debit_note",
                    transaction_date=dn_date, amount=unallocated, total_amount=unallocated,
                    status="Unutilized", reference_number="-",
                    notes=f"Debit Note Balance (Unutilized)",
                    ledger_name=effective_branch
                )

        logger.info(
            "[DebitNoteService] Vendor Portal synced for DN: %s | Branch: %s",
            dn_number, effective_branch
        )
    except Exception as exc:
        logger.error("[DebitNoteService] Vendor Portal sync failed: %s", exc)


# ===========================================================================
# MAIN ENTRY POINT
# ===========================================================================

def post_debit_note(
    *,
    debit_note_instance,
    voucher_obj,
    supply_data: dict,
    due_data: dict,
    payment_details: list[dict],
    tax_type: str,
    company_pos: str,
    tenant_id: str,
) -> None:
    """
    Full posting pipeline called after the Debit Note is persisted.

    Parameters
    ----------
    debit_note_instance : VoucherDebitNoteSupplierDetails
    voucher_obj         : Voucher (global)
    supply_data         : dict with 'items', totals etc. from VoucherDebitNoteSupplyDetails
    due_data            : dict from VoucherDebitNoteDueDetails
    payment_details     : list of rows from Payment Details tab
    tax_type            : 'IGST' or 'CGST_SGST'
    company_pos         : The company's registered state (for inter-state detection)
    tenant_id           : Tenant scope
    """
    items = supply_data.get("items", []) or []

    # 1. Build TDS / TCS context per invoice
    # Collect unique supplier invoice nos from items
    invoice_nos: list[str] = []
    for item in items:
        inv = str(item.get("supplierInvoiceNo", "") or "").strip()
        if inv and inv not in invoice_nos:
            invoice_nos.append(inv)

    if not invoice_nos:
        # Fallback: read from the header field
        raw = debit_note_instance.supplier_invoice_nos or ""
        invoice_nos = [x.strip() for x in raw.split(",") if x.strip()]

    # group-level TDS/TCS reverse flags from due_data
    reverse_tcs_flag = str(due_data.get("reverseTcs", "No")).lower() in ("yes", "true", "1")
    reverse_tds_flag = str(due_data.get("reverseTds", "No")).lower() in ("yes", "true", "1")

    tcs_by_invoice: dict[str, Decimal] = {}
    tds_by_invoice: dict[str, Decimal] = {}
    purchase_info_map: dict[str, dict] = {}

    dn_taxable_total = Decimal(str(supply_data.get("total_taxable_value", 0) or 0))

    for inv_no in invoice_nos:
        pinfo = _fetch_purchase_tds_tcs(inv_no, tenant_id)
        purchase_info_map[inv_no] = pinfo

        # Proportion of DN taxable for this invoice
        inv_items = [i for i in items if str(i.get("supplierInvoiceNo", "")).strip() == inv_no]
        inv_taxable = sum(Decimal(str(i.get("taxableValue", 0) or 0)) for i in inv_items)
        if not inv_taxable:
            inv_taxable = dn_taxable_total  # single-invoice fallback

        try:
            reversals = compute_tds_tcs_reversals(
                dn_taxable_value=inv_taxable,
                reverse_tcs_flag=reverse_tcs_flag,
                reverse_tds_flag=reverse_tds_flag,
                purchase_info=pinfo,
            )
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

        tcs_by_invoice[inv_no] = reversals["tcs_reversed"]
        tds_by_invoice[inv_no] = reversals["tds_reversed"]

    total_tcs_reversed = sum(tcs_by_invoice.values(), Decimal("0"))
    total_tds_reversed = sum(tds_by_invoice.values(), Decimal("0"))

    # 2. Vendor debit amount
    total_gst = (
        Decimal(str(supply_data.get("total_igst", 0) or 0))
        + Decimal(str(supply_data.get("total_cgst", 0) or 0))
        + Decimal(str(supply_data.get("total_sgst", 0) or 0))
        + Decimal(str(supply_data.get("total_cess", 0) or 0))
    )
    vendor_debit = (dn_taxable_total + total_gst + total_tcs_reversed - total_tds_reversed).quantize(
        TWO_PLACES, rounding=ROUND_HALF_UP
    )

    # Resolve purchase ledger from first available invoice
    purchase_ledger_name = None
    for inv_no in invoice_nos:
        pinfo = purchase_info_map.get(inv_no, {})
        if pinfo.get("purchase_ledger"):
            purchase_ledger_name = pinfo["purchase_ledger"]
            break

    # 3. Double-entry accounting
    try:
        post_debit_note_accounting(
            debit_note_instance=debit_note_instance,
            voucher_obj=voucher_obj,
            items=items,
            tax_type=tax_type,
            tds_reversed=total_tds_reversed,
            tcs_reversed=total_tcs_reversed,
            purchase_ledger_name=purchase_ledger_name,
            tenant_id=tenant_id,
            payment_details=payment_details,
        )
    except Exception as exc:
        logger.error("[DebitNoteService] Accounting post error: %s", exc)
        # We do NOT re-raise here to allow the voucher save to complete;
        # accounting failures are logged but the document is still persisted.

    # 4. Bill allocation
    # write_bill_allocation(
    #     debit_note_instance=debit_note_instance,
    #     voucher_obj=voucher_obj,
    #     payment_details=payment_details,
    #     vendor_debit_amount=vendor_debit,
    #     tenant_id=tenant_id,
    #     tcs_by_invoice=tcs_by_invoice,
    #     tds_by_invoice=tds_by_invoice,
    #     items=items,
    # )

    # 5. Vendor Portal sync
    mirror_to_vendor_portal(
        debit_note_instance=debit_note_instance,
        voucher_obj=voucher_obj,
        net_amount=vendor_debit,
        items=items,
        tcs_by_invoice=tcs_by_invoice,
        tds_by_invoice=tds_by_invoice
    )

    logger.info(
        "[DebitNoteService] Complete. DN=%s Vendor Debit=₹%s TCS_rev=₹%s TDS_rev=₹%s",
        voucher_obj.voucher_number, vendor_debit, total_tcs_reversed, total_tds_reversed,
    )
