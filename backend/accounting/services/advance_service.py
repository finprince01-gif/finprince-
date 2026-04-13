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
    In the new system, allocations are tracked in PendingTransaction.
    """
    from accounting.models import PendingTransaction
    # In the new system, we don't have a direct 'advance_source_id' link in PendingTransaction yet,
    # but we can resolve it via reference_number if needed. 
    # For now, we'll try to sum based on common patterns.
    # Note: This is an approximation for backward compatibility.
    result = PendingTransaction.objects.filter(
        tenant_id=tenant_id,
        reference_type='advance',
    ).aggregate(total=Sum('allocated_amount'))['total']
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
    from accounting.models import AdvanceAllocation as AdvanceAllocationMap
    from accounting.models import PaymentVoucherItem
    from accounting.models import ReceiptVoucherItem

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

        # ── Step 2: Resolve source from AdvanceAllocation ─────────────
        from accounting.models import AdvanceAllocation
        source = AdvanceAllocation.objects.filter(
            tenant_id=tenant_id,
            advance_ref_no=ref_no
        ).first()

        if not source:
            # Cannot resolve — skip silently but log
            print(f"[AdvanceService] WARNING: Cannot resolve advance ref_no='{ref_no}' "
                  f"for tenant={tenant_id}. Skipping.")
            continue

        source_id = source.id
        source_type = 'payment' if 'payment' in source.type else 'receipt'
        total_amt = source.advance_amount

        # ── Step 3: Validate remaining ───────────────────────────────
        allocated = get_allocated_amount(source_id, source_type, tenant_id)
        remaining = total_amt - allocated

        if applied > remaining + Decimal('0.01'):
            raise ValueError(
                f"Advance '{ref_no}' remaining balance is ₹{remaining:.2f}, "
                f"but ₹{applied:.2f} was requested."
            )

        # ── Step 4: Insert Allocation in PendingTransaction ───────────
        from accounting.models import PendingTransaction
        alloc = PendingTransaction.objects.create(
            tenant_id=tenant_id,
            type=voucher_type,
            voucher_number=voucher_id, # Simplified for shim
            reference_number=ref_no,
            reference_type='advance',
            pay_to_ledger_id=ledger_id or source.pay_to_ledger_id,
            amount_applied=applied,
            status='paid'
        )
        created.append(alloc)
        print(f"[AdvanceService] Allocated ₹{applied} from "
              f"{source_type}:{source_id} (ref={ref_no}) "
              f"→ {voucher_type}:{voucher_id}")

    return created
