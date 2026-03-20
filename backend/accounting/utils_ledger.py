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
