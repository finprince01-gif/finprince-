from django.db import transaction
from .models import MasterLedger

def get_or_create_entity_ledger(tenant_id, entity_name, entity_type, created_by=None):
    """
    Ensures a ledger exists for a Customer or Vendor.
    entity_type: 'customer' or 'vendor'
    """
    category = 'Asset' if entity_type == 'customer' else 'Liability'
    group = 'Sundry Debtors' if entity_type == 'customer' else 'Sundry Creditors'
    
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
