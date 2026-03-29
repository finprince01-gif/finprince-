from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterCategory

def check_categories():
    count = VendorMasterCategory.objects.count()
    print(f"Total categories: {count}")
    
    if count == 0:
        print("Creating default categories...")
        # Get a tenant_id
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.first()
        tenant_id = user.tenant_id if user and hasattr(user, 'tenant_id') else '88fe4389-58a9-4244-9878-8a4e646898bd'
        
        defaults = [
            {'category': 'RAW MATERIAL', 'group': 'Domestic', 'subgroup': 'Active'},
            {'category': 'RAW MATERIAL', 'group': 'Import', 'subgroup': 'Active'},
            {'category': 'STORES & SPARES', 'group': 'General', 'subgroup': 'Active'},
            {'category': 'PACKING MATERIAL', 'group': 'Primary', 'subgroup': 'Active'},
            {'category': 'SERVICES', 'group': 'Maintenance', 'subgroup': 'Monthly'},
        ]
        
        for d in defaults:
            VendorMasterCategory.objects.get_or_create(
                tenant_id=tenant_id,
                **d
            )
        print("Default categories created.")

if __name__ == "__main__":
    check_categories()
