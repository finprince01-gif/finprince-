
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from services.models import ServiceGroup

# Check all service groups in the database
all_groups = ServiceGroup.objects.all()



for group in all_groups:









# Group by tenant
from collections import defaultdict
by_tenant = defaultdict(list)
for group in all_groups:
    by_tenant[group.tenant_id].append(group)



for tenant_id, groups in by_tenant.items():


    for g in groups:


