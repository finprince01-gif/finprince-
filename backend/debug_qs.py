
import os
import sys
import django

# Setup Django
sys.path.append(r'd:\testing\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterPOSettings
from vendors.posettings_database import POSettingsDatabase

tenant_id = "392f47fa-4cab-41f9-9353-75d2b85dec97"
print(f"Testing for tenant: {tenant_id}")

# 1. Direct filter
qs1 = VendorMasterPOSettings.objects.filter(tenant_id=tenant_id, is_active=True)
print(f"Direct filter (is_active=True) count: {qs1.count()}")

# 2. Database method
qs2 = POSettingsDatabase.get_po_settings_by_tenant(tenant_id, is_active=True)
print(f"Database method (is_active=True) count: {qs2.count()}")

# 3. List all
qs_all = VendorMasterPOSettings.objects.filter(tenant_id=tenant_id)
print(f"All count: {qs_all.count()}")
for item in qs_all:
    print(f"ID={item.id}, Name={item.name}, Active={item.is_active}")
