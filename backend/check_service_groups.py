
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from services.models import ServiceGroup

# Check all service groups in the database
all_groups = ServiceGroup.objects.all()
print(f"Total service groups in database: {all_groups.count()}")
print("\nService Groups:")
print("-" * 80)
for group in all_groups:
    print(f"ID: {group.id}")
    print(f"Tenant ID: {group.tenant_id}")
    print(f"Category: {group.category}")
    print(f"Group: {group.group}")
    print(f"Subgroup: {group.subgroup}")
    print(f"Is Active: {group.is_active}")
    print(f"Created At: {group.created_at}")
    print("-" * 80)

# Group by tenant
from collections import defaultdict
by_tenant = defaultdict(list)
for group in all_groups:
    by_tenant[group.tenant_id].append(group)

print("\nGrouped by Tenant:")
print("-" * 80)
for tenant_id, groups in by_tenant.items():
    print(f"Tenant: {tenant_id}")
    print(f"  Count: {len(groups)}")
    for g in groups:
        print(f"  - {g.category} > {g.group} > {g.subgroup}")
    print("-" * 80)
