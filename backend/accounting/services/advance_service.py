"""
advance_service.py
==================
Utility functions for advance payment tracking via AdvanceAllocationMap.

All functions are READ-ONLY helpers used by the API and serializers.
Write operations are handled directly in the serializers for clarity.
"""
from decimal import Decimal
from django.db.models import Sum


def get_allocated_amount(advance_source_id: int, advance_source_type: str, tenant_id) -> Decimal:
    """
    Return the total amount already allocated from a specific advance source.

    Parameters
    ----------
    advance_source_id   : PK of PaymentVoucherItem or ReceiptVoucherItem
    advance_source_type : 'payment' | 'receipt'
    tenant_id           : Tenant scope
    """
    from accounting.models_advance_allocation import AdvanceAllocationMap
    result = AdvanceAllocationMap.objects.filter(
        tenant_id=tenant_id,
        advance_source_id=advance_source_id,
        advance_source_type=advance_source_type,
    ).aggregate(total=Sum('amount'))['total']
    return result or Decimal('0')


def get_remaining_advance(advance_source_id: int, advance_source_type: str,
                          total_amount, tenant_id) -> Decimal:
    """
    Return the remaining (un-consumed) balance of an advance.

    Parameters
    ----------
    total_amount : The original advance amount stored in the source voucher item.
    """
    allocated = get_allocated_amount(advance_source_id, advance_source_type, tenant_id)
    return Decimal(str(total_amount)) - allocated


def write_allocations(*, tenant_id, voucher_id: int, voucher_type: str,
                      advance_refs: list, ledger_id=None):
    """
    Idempotent write of advance allocations for a voucher.

    1. DELETE existing rows for (tenant_id, voucher_id, voucher_type)
    2. Resolve each ref_no → advance_source_id
    3. Validate remaining balance
    4. INSERT new rows

    Parameters
    ----------
    advance_refs : list of dicts with keys:
                    - refNo         : advance reference number
                    - appliedNow    : amount applied (numeric or bool True meaning 'full')
                    - amount        : alternative key for applied amount

    Returns
    -------
    list of created AdvanceAllocationMap instances, or raises ValueError on validation fail.
    """
    from accounting.models_advance_allocation import AdvanceAllocationMap
    from accounting.models_voucher_payment import PaymentVoucherItem
    from accounting.models_voucher_receipt import ReceiptVoucherItem

    # ── Step 1: Idempotent delete ────────────────────────────────────
    AdvanceAllocationMap.objects.filter(
        tenant_id=tenant_id,
        voucher_id=voucher_id,
        voucher_type=voucher_type,
    ).delete()

    created = []
    for ref in advance_refs:
        ref_no = ref.get('refNo') or ref.get('ref_no') or ref.get('advance_ref_no')

        # Resolve applied amount - priorities: allocatedNow -> appliedNow -> applied_amount -> 0
        applied_raw = ref.get('allocatedNow')
        if applied_raw is None or (isinstance(applied_raw, str) and not applied_raw.strip()):
           applied_raw = ref.get('appliedNow')
        
        if applied_raw is None:
             applied_raw = ref.get('applied_amount')
        if applied_raw is None:
             applied_raw = 0  # Default to zero instead of auto-consuming everything

        # Handle string "0" or empty string
        if isinstance(applied_raw, str):
            applied_raw = applied_raw.strip()
            if not applied_raw:
                applied_raw = 0

        # If appliedNow is a boolean True (legacy), treat as "full amount"
        if isinstance(applied_raw, bool):
            applied_raw = ref.get('amount', 0) if applied_raw else 0

        applied = Decimal(str(applied_raw or 0))

        if not ref_no or applied <= 0:
            continue

        # ── Step 2: Resolve source ───────────────────────────────────
        pay_item = PaymentVoucherItem.objects.filter(
            advance_ref_no=ref_no,
            voucher__tenant_id=tenant_id,
            reference_type='ADVANCE',
        ).first()
        rec_item = ReceiptVoucherItem.objects.filter(
            advance_ref_no=ref_no,
            voucher__tenant_id=tenant_id,
        ).first() if not pay_item else None

        source = pay_item or rec_item
        if not source:
            # Cannot resolve — skip silently but log
            print(f"[AdvanceService] WARNING: Cannot resolve advance ref_no='{ref_no}' "
                  f"for tenant={tenant_id}. Skipping.")
            continue

        source_id = source.id
        source_type = 'payment' if pay_item else 'receipt'
        total_amt = Decimal(str(source.amount if pay_item else source.received_amount or source.amount))

        # ── Step 3: Validate remaining ───────────────────────────────
        already_allocated = get_allocated_amount(source_id, source_type, tenant_id)
        remaining = total_amt - already_allocated

        if applied > remaining + Decimal('0.01'):  # 1-paisa tolerance
            raise ValueError(
                f"Advance '{ref_no}' remaining balance is ₹{remaining:.2f}, "
                f"but ₹{applied:.2f} was requested."
            )

        # Resolve ledger_id if not passed
        resolved_ledger_id = ledger_id
        if not resolved_ledger_id:
            if pay_item:
                resolved_ledger_id = pay_item.pay_to_ledger_id
            elif rec_item:
                resolved_ledger_id = rec_item.customer_id

        # ── Step 4: Insert ───────────────────────────────────────────
        alloc = AdvanceAllocationMap.objects.create(
            tenant_id=tenant_id,
            advance_source_id=source_id,
            advance_source_type=source_type,
            advance_ref_no=ref_no,
            voucher_id=voucher_id,
            voucher_type=voucher_type,
            ledger_id=resolved_ledger_id,
            amount=applied,
        )
        created.append(alloc)
        print(f"[AdvanceService] Allocated ₹{applied} from "
              f"{source_type}:{source_id} (ref={ref_no}) "
              f"→ {voucher_type}:{voucher_id}")

    return created
