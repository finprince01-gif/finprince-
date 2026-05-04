from django.db import transaction
from .models import MasterLedger

def get_or_create_entity_ledger(tenant_id, entity_name, entity_type, created_by=None):
    """
    Ensures a ledger exists for a Vendor.
    Customer auto-ledger creation is intentionally disabled.
    """
    if entity_type == 'customer':
        return MasterLedger.objects.filter(
            tenant_id=tenant_id,
            name=entity_name,
            group='Sundry Debtors'
        ).first()

    category = 'Liability'
    group = 'Sundry Creditors'
    
    with transaction.atomic():
        ledger, created = MasterLedger.objects.update_or_create(
            tenant_id=tenant_id,
            name=entity_name,
            group=group,
            defaults={
                'category': category
            }
        )
        return ledger

def get_standard_ledger(tenant_id, name, group, category):
    """
    Get or create a standard accounting ledger for a tenant.
    """
    ledger, created = MasterLedger.objects.get_or_create(
        tenant_id=tenant_id,
        name=name,
        defaults={
            'group': group,
            'category': category
        }
    )
    return ledger


def get_tds_ledger_for_vendor(tenant_id, vendor_basic_detail_id):
    """
    Fetch the TDS ledger for a vendor based on the TDS/TCS section selected
    during vendor creation.

    Ledger name format:
      - TDS: "TDS - <section_applicable>"
        e.g. "TDS - Section 194-IA - Immovable Property Transfer"
      - TCS: "TCS - <section_applicable>"
        e.g. "TCS - Section 206C(1) - Sale of Forest Produce"

    Group : "Duties & Taxes"
    Category: "Liability"

    Returns (ledger_obj, tax_type_str) or (None, None) if no TDS/TCS configured.
    """
    if not vendor_basic_detail_id:
        return None, None

    try:
        from vendors.models import VendorMasterTDS
        tds_obj = VendorMasterTDS.objects.filter(
            vendor_basic_detail_id=vendor_basic_detail_id,
            is_active=True
        ).first()

        if not tds_obj:
            return None, None

        section = None
        tax_type = None

        # TDS takes priority; then TCS
        if tds_obj.tds_section_applicable:
            section = tds_obj.tds_section_applicable.strip()
            tax_type = 'TDS'
        elif tds_obj.tcs_section_applicable:
            section = tds_obj.tcs_section_applicable.strip()
            tax_type = 'TCS'

        if not section:
            return None, None

        # Truncate section to 200 chars to keep ledger name manageable
        section_short = section[:200]
        ledger_name = f"{tax_type} - {section_short}"

        ledger = get_standard_ledger(
            tenant_id=tenant_id,
            name=ledger_name,
            group='Duties & Taxes',
            category='Liability'
        )
        return ledger, tax_type

    except Exception as e:
        print(f"[utils_ledger] get_tds_ledger_for_vendor error: {e}")
        return None, None


def get_tcs_ledger_for_customer(tenant_id, customer_id):
    """
    Fetch the TCS ledger for a customer based on the TCS/TDS section
    selected during customer creation.

    Ledger name format:
      - TCS: "TCS - <tcs_section>"
      - TDS: "TDS - <tds_section>"

    Group : "Duties & Taxes"
    Category: "Liability"

    Returns (ledger_obj, tax_type_str) or (None, None) if not configured.
    """
    if not customer_id:
        return None, None

    try:
        from customerportal.database import CustomerMasterCustomerTDS
        tds_obj = CustomerMasterCustomerTDS.objects.filter(
            customer_basic_detail_id=customer_id
        ).first()

        if not tds_obj:
            return None, None

        section = None
        tax_type = None

        # TCS is primary for sales (customer collects TCS from buyer)
        if tds_obj.tcs_enabled and tds_obj.tcs_section:
            section = tds_obj.tcs_section.strip()
            tax_type = 'TCS'
        elif tds_obj.tds_enabled and tds_obj.tds_section:
            section = tds_obj.tds_section.strip()
            tax_type = 'TDS'

        if not section:
            return None, None

        section_short = section[:200]
        ledger_name = f"{tax_type} - {section_short}"

        ledger = get_standard_ledger(
            tenant_id=tenant_id,
            name=ledger_name,
            group='Duties & Taxes',
            category='Liability'
        )
        return ledger, tax_type

    except Exception as e:
        print(f"[utils_ledger] get_tcs_ledger_for_customer error: {e}")
        return None, None
