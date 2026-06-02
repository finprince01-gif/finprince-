from django.db import transaction
from decimal import Decimal
from accounting.models import JournalEntry, MasterLedger

def _resolve_ledger(value, tenant_id=None):
    """
    Resolve either a numeric ID, a ledger name (string), or a portal prefixed ID 
    (e.g., 'portal-cust-123' or 'portal-vend-456') to a MasterLedger instance.
    Returns the MasterLedger instance, or None if not found/invalid.
    """
    if value is None or value == '':
        return None

    # Handle portal prefixes
    if isinstance(value, str):
        val_str = value.strip()
        if val_str.startswith('portal-cust-'):
            try:
                cust_id = int(val_str.replace('portal-cust-', ''))
                from customerportal.database import CustomerMasterCustomerBasicDetails
                cust = CustomerMasterCustomerBasicDetails.objects.filter(id=cust_id).first()
                if cust and cust.ledger_id:
                    value = cust.ledger_id
            except Exception:
                pass
        elif val_str.startswith('portal-vend-'):
            try:
                vend_id = int(val_str.replace('portal-vend-', ''))
                from vendors.models import VendorMasterBasicDetail
                vend = VendorMasterBasicDetail.objects.filter(id=vend_id).first()
                if vend and vend.ledger_id:
                    value = vend.ledger_id
            except Exception:
                pass

    # Already an integer ID
    try:
        pk = int(value)
        qs = MasterLedger.objects.filter(id=pk)
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        return qs.first()
    except (ValueError, TypeError):
        pass

    # String name
    if isinstance(value, str):
        qs = MasterLedger.objects.filter(name__iexact=value.strip())
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        return qs.first()

    # If already a model instance
    if hasattr(value, 'id'):
        return value

    return None

def post_transaction(voucher_type, voucher_id, tenant_id, entries, transaction_date=None, voucher_number=None):
    """
    Actual double-entry accounting posting.
    Validates:
    - At least 2 entries
    - Sum(debit) == Sum(credit)
    - No entry has both debit and credit > 0
    - No entry has both = 0
    Check duplicate by (voucher_type, voucher_id)
    """
    if len(entries) < 2:
        raise ValueError("At least 2 entries required for double-entry")

    total_debit = Decimal('0.00')
    total_credit = Decimal('0.00')

    for entry in entries:
        dr = Decimal(str(entry.get('debit', 0)))
        cr = Decimal(str(entry.get('credit', 0)))

        if dr > 0 and cr > 0:
            raise ValueError("Entry cannot have both debit and credit > 0")
        if dr == 0 and cr == 0:
            raise ValueError("Entry must have either debit or credit > 0")

        total_debit += dr
        total_credit += cr

    if total_debit != total_credit:
        raise ValueError(f"Accounting mismatch: Sum(debit)={total_debit} != Sum(credit)={total_credit}")

    with transaction.atomic():
        # Phase 3.1: Add SAFE CLEANUP before insert.
        # Delete by voucher_id (primary cleanup path).
        JournalEntry.objects.filter(
            tenant_id=tenant_id,
            voucher_type=voucher_type,
            voucher_id=voucher_id
        ).delete()
        # Safety net: also delete by voucher_number to catch entries that may have been
        # created with a different voucher_id (e.g., PaymentVoucher.id vs generic Voucher.id).
        # This prevents duplicate ledger entries after editing a voucher.
        if voucher_number:
            JournalEntry.objects.filter(
                tenant_id=tenant_id,
                voucher_type=voucher_type,
                voucher_number=voucher_number
            ).delete()

        # Phase 3.2: Create JournalEntry rows with STRICT ledger_id usage
        journal_objects = []
        for entry in entries:
            # Resolve ledger source
            l_id = entry.get('ledger_id')
            if not l_id:
                # Fallback check
                l_id = entry.get('ledger_id_val')

            if not l_id:
                continue

            journal_objects.append(JournalEntry(
                tenant_id=tenant_id,
                voucher_type=voucher_type,
                voucher_id=voucher_id,
                voucher_number=voucher_number,
                transaction_date=transaction_date,
                ledger_id=l_id,
                debit=Decimal(str(entry.get('debit', 0))),
                credit=Decimal(str(entry.get('credit', 0))),
                # Descriptive fields kept for backward compatibility but ignored for core logic
                ledger_name=getattr(_resolve_ledger(l_id, tenant_id), 'name', None),
                ledger_id_val=l_id
            ))
        
        if journal_objects:
            JournalEntry.objects.bulk_create(journal_objects)
        return True
