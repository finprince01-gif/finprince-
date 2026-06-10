import logging
from django.core.management import call_command
from django.utils import timezone

logger = logging.getLogger(__name__)

def seed_tenant_data(tenant_id):
    """
    Seed initial data for a new tenant.
    This includes chart of accounts, voucher configurations, etc.
    """
    logger.info(f"🌱 Starting data seeding for tenant {tenant_id}")
    
    try:
        # 1. Seed default ledger groups
        from registration.database import seed_default_ledger_groups
        seed_default_ledger_groups(tenant_id)
        logger.info(f"✅ Seeded default ledger groups for tenant {tenant_id}")
        
        # 2. Seed default voucher configurations
        from masters.database import ensure_default_vouchers
        ensure_default_vouchers(tenant_id)
        logger.info(f"✅ Seeded default voucher configurations for tenant {tenant_id}")
        
    except Exception as e:
        logger.error(f"❌ Error seeding data for tenant {tenant_id}: {e}", exc_info=True)
        # Note: We catch the error so registration doesn't fail just because seeding failed
        # But in production you might want to handle this more strictly
    
    logger.info(f"✅ Data seeding completed for tenant {tenant_id}")
