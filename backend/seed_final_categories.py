import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterCategory

def seed_exact_categories():
    # List provided in the screenshot
    categories = [
        "Raw Material",
        "Stores and Spares",
        "Packing Material",
        "Stock in Trade",
        "Fixed Assets",
        "Capital Goods",
        "Consumables",
        "Service"
    ]
    
    # Get the tenant_id from existing users or use default
    from core.models import Tenant
    tenant = Tenant.objects.first()
    tenant_id = tenant.id if tenant else '88fe4389-58a9-4244-9878-8a4e646898bd'
    
    print(f"Seeding {len(categories)} categories for tenant {tenant_id}...")
    
    for cat_name in categories:
        obj, created = VendorMasterCategory.objects.get_or_create(
            tenant_id=tenant_id,
            category=cat_name,
            group='',
            subgroup=''
        )
        if created:
            print(f"Created: {cat_name}")
        else:
            print(f"Already exists: {cat_name}")

if __name__ == "__main__":
    seed_exact_categories()
