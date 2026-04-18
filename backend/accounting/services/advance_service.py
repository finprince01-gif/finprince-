"""
advance_service.py
==================
Utility functions for advance payment tracking via AdvanceAllocationMap.

All functions are READ-ONLY helpers used by the API and serializers.
Write operations are handled directly in the serializers for clarity.
"""
from decimal import Decimal
from django.db.models import Sum


def get_allocated_amount(advance_source_id: int, advance_source_type: str, tenant_id, ref_no=None) -> Decimal:
    """
    Return the total amount already allocated from a specific advance source.
    In the new system, we primarily use VoucherAdvanceAdjustment.
    For backward compatibility, we also sum from PendingTransaction and AdvanceAllocation.
    """
    from accounting.models import PendingTransaction, AdvanceAllocation, VoucherAdvanceAdjustment, Voucher
    from django.db.models import Sum, Q

    import uuid
    # Normalize tenant_ids to match both varchar(32) and varchar(36) formats
    hex_tenant = str(tenant_id).replace('-', '')
    try:
        hyphen_tenant = str(uuid.UUID(hex_tenant))
    except:
        hyphen_tenant = str(tenant_id)
        
    tenant_variants = list(set([str(tenant_id), hex_tenant, hyphen_tenant]))
    
    print(f"[AdvanceService] get_allocated_amount: id={advance_source_id}, type={advance_source_type}, ref={ref_no}")
    
    # Resolve source_v using any tenant variant
    source_v = Voucher.objects.filter(id=advance_source_id, tenant_id__in=tenant_variants).first()
    
    if not ref_no:
        source = AdvanceAllocation.objects.filter(id=advance_source_id, tenant_id__in=tenant_variants).first()
        if not source:
            source = PendingTransaction.objects.filter(id=advance_source_id, tenant_id__in=tenant_variants, is_advance=True).first()
        
        if source:
            ref_no = source.advance_ref_no or source.reference_number
            # If we don't have source_v yet, resolved it from source.transaction_id
            if not source_v:
                 source_v = Voucher.objects.filter(reference_id=source.transaction_id, tenant_id__in=tenant_variants).first()
    
    # 2. Sum from the new dedicated table (VoucherAdvanceAdjustment)
    # Use variant matching for tenant to ensure we find all stored formats
    adv_q = Q(tenant_id__in=tenant_variants)
    if source_v and ref_no:
        adv_q &= (Q(advance_voucher=source_v) | Q(ref_no__iexact=ref_no))
    elif source_v:
        adv_q &= Q(advance_voucher=source_v)
    elif ref_no:
        adv_q &= Q(ref_no__iexact=ref_no)
    else:
        return Decimal('0')

    sum_new = VoucherAdvanceAdjustment.objects.filter(adv_q).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    # 3. Sum from legacy tables (Backward Compatibility)
    match_q = Q(tenant_id__in=tenant_variants)
    if source_v: 
        match_q &= Q(advance_voucher=source_v)
    else: 
        match_q &= Q(ref_no__iexact=ref_no)
        
    new_target_v_ids = VoucherAdvanceAdjustment.objects.filter(match_q).values_list('target_voucher_id', flat=True)

    sum_pending = PendingTransaction.objects.filter(
        tenant_id__in=tenant_variants,
        reference_number__iexact=ref_no,
        reference_type__iexact='ADVANCE'
    ).exclude(
        id=advance_source_id
    ).exclude(
        transaction_id__in=new_target_v_ids
    ).aggregate(total=Sum('allocated_amount'))['total'] or Decimal('0')

    sum_history = AdvanceAllocation.objects.filter(
        tenant_id__in=tenant_variants,
        reference_number__iexact=ref_no,
        reference_type__iexact='ADVANCE'
    ).exclude(
        id=advance_source_id
    ).exclude(
        transaction_id__in=new_target_v_ids
    ).aggregate(total=Sum('allocated_amount'))['total'] or Decimal('0')

    return Decimal(str(sum_new)) + Decimal(str(sum_pending)) + Decimal(str(sum_history))


def get_remaining_advance(advance_source_id: int, advance_source_type: str,
                          total_amount, tenant_id) -> Decimal:
    """
    Return the remaining (un-consumed) balance of an advance.
    """
    allocated = get_allocated_amount(advance_source_id, advance_source_type, tenant_id)
    return Decimal(str(total_amount)) - allocated


def write_allocations(*, tenant_id, voucher_id: int, voucher_type: str,
                      advance_refs: list, ledger_id=None):
    """
    Idempotent write of advance allocations using the new VoucherAdvanceAdjustment table.
    """
    from accounting.models import (
        Voucher, VoucherAdvanceAdjustment, 
        AdvanceAllocation, PendingTransaction
    )
    from django.utils import timezone
    import uuid
    
    # Normalize tenant_ids for mixed schema (vouchers=36 chars, adjustments=32 hex)
    hex_tenant = str(tenant_id).replace('-', '')
    hyphen_tenant = str(uuid.UUID(hex_tenant)) if '-' not in str(tenant_id) else str(tenant_id)
    tenant_variants = list(set([str(tenant_id), hex_tenant, hyphen_tenant]))
    
    print(f"[AdvanceService] write_allocations: voucher_id={voucher_id}, refs={len(advance_refs)}")

    # 1. Resolve the Target Voucher
    target_v = Voucher.objects.filter(id=voucher_id, tenant_id__in=tenant_variants).first()
    if not target_v:
        target_v = Voucher.objects.filter(reference_id=voucher_id, tenant_id__in=tenant_variants).first()
    
    if not target_v:
        print(f"[AdvanceService] ABORT: Target voucher {voucher_id} not found.")
        return []

    # 2. Idempotent delete (Uses tenant variants for maximum compatibility)
    v_adj_del = VoucherAdvanceAdjustment.objects.filter(tenant_id__in=tenant_variants, target_voucher=target_v).delete()
    adv_alc_del = AdvanceAllocation.objects.filter(tenant_id__in=tenant_variants, transaction_id=voucher_id, type=voucher_type).delete()
    pend_tx_del = PendingTransaction.objects.filter(tenant_id__in=tenant_variants, transaction_id=voucher_id, reference_type__iexact='advance').delete()
    print(f"[AdvanceService] Cleanup: {v_adj_del[0]} adjustments removed.")

    created = []
    for ref in advance_refs:
        ref_no = ref.get('refNo') or ref.get('ref_no') or ref.get('advance_ref_no')

        # Resolve applied amount
        applied_raw = ref.get('allocatedNow') or ref.get('appliedNow') or ref.get('applied_amount') or 0
        if isinstance(applied_raw, bool):
            applied_raw = ref.get('amount', 0) if applied_raw else 0
        
        applied = Decimal(str(applied_raw))
        if not ref_no or applied <= 0:
            print(f"[AdvanceService] SKIP: ref_no='{ref_no}', amount={applied}")
            continue

        # 3. Resolve source advance
        source_id_from_ref = ref.get('id')
        source = None
        
        if source_id_from_ref:
            source = AdvanceAllocation.objects.filter(id=source_id_from_ref, tenant_id__in=tenant_variants).first()
            if not source:
                source = PendingTransaction.objects.filter(id=source_id_from_ref, tenant_id__in=tenant_variants, is_advance=True).first()
        
        if not source:
            source = AdvanceAllocation.objects.filter(tenant_id__in=tenant_variants, advance_ref_no=ref_no).first()
        if not source:
            source = PendingTransaction.objects.filter(tenant_id__in=tenant_variants, reference_number__iexact=ref_no, is_advance=True).first()

        if not source:
            print(f"[AdvanceService] SKIP: Source '{ref_no}' (ID: {source_id_from_ref}) not found in ANY table.")
            continue

        # Resolve the Source Voucher object
        advance_v = Voucher.objects.filter(reference_id=source.transaction_id, tenant_id__in=tenant_variants).first()
        if not advance_v:
             advance_v = Voucher.objects.filter(voucher_number=(source.advance_ref_no or source.reference_number), tenant_id__in=tenant_variants).first()
        
        if not advance_v:
            print(f"[AdvanceService] SKIP: Could not resolve Voucher for Source ID {source.id} (Ref: {ref_no}).")
            continue

        # 4. Validate remaining
        source_id = source.id
        source_type = 'payment' if 'payment' in str(getattr(source, 'type', '')).lower() else 'receipt'
        total_amt = Decimal(str(source.amount or source.allocated_amount or 0))
        allocated = get_allocated_amount(source_id, source_type, hex_tenant, ref_no=ref_no)
        remaining = total_amt - allocated

        if applied > remaining + Decimal('0.01'):
            raise ValueError(f"Advance '{ref_no}' balance Rs.{remaining:.2f} is insufficient for Rs.{applied:.2f}.")

        # 5. Save to the primary relational table (Now supporting hyphens)
        print(f"[AdvanceService] Saving Adjustment: {ref_no} Rs.{applied}")
        adj = VoucherAdvanceAdjustment.objects.create(
            tenant_id=hyphen_tenant,
            advance_voucher=advance_v,
            target_voucher=target_v,
            ref_no=ref_no,
            amount=applied,
            adjustment_date=target_v.date,
            customer_id=ledger_id if voucher_type == 'sales' else None,
            vendor_id=ledger_id if voucher_type == 'purchase' else None,
            type=voucher_type
        )
        created.append(adj)
        
        # 6. Legacy Synchronizer (Optional - wrapped in nested atomic to prevent transaction poisoning)
        try:
            from django.db import transaction
            with transaction.atomic():
                PendingTransaction.objects.create(
                    tenant_id=target_v.tenant_id,
                    type=voucher_type,
                    transaction_id=voucher_id,
                    reference_number=ref_no,
                    reference_type='advance',
                    pay_to_ledger_id_val=ledger_id, # Use val field if available to avoid FK failures
                    allocated_amount=applied
                )
        except Exception as legacy_e:
            print(f"[AdvanceService] SKIP Legacy Sync: {legacy_e}")

    return created
