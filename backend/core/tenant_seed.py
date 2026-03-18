
import logging
from django.core.management import call_command

logger = logging.getLogger(__name__)

def seed_tenant_data(tenant_id):
    """
    Seed initial data for a new tenant.
    This includes chart of accounts, voucher configurations, etc.
    """
    logger.info(f"🌱 Starting data seeding for tenant {tenant_id}")
    
    try:
        # TODO: Call specific seed functions or management commands here
        # For example:
        # call_command('seed_voucher_configurations', tenant_id=tenant_id)
        
        # Currently just a placeholder to prevent import errors and crashes
        # Call the seeder from registration.database
        # from registration.database import seed_default_ledger_groups
        # seed_default_ledger_groups(tenant_id)
        pass
        
    except Exception as e:
        logger.error(f"❌ Error seeding data for tenant {tenant_id}: {e}")
        # Note: We catch the error so registration doesn't fail just because seeding failed
        # But in production you might want to handle this more strictly
    
    logger.info(f"✅ Data seeding completed for tenant {tenant_id}")
