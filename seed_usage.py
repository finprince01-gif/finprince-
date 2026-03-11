import os
import django
import sys

# Set up Django environment
sys.path.append('c:/108/muthu/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import Tenant, AIUsage, User
from datetime import datetime

t = Tenant.objects.all().first()
if t:
    now = datetime.now()
    usage, created = AIUsage.objects.get_or_create(
        tenant_id=t.id,
        year=now.year,
        month=now.month,
        defaults={'used_count': 2}
    )
    if not created:
        usage.used_count = 2
        usage.save()
    print(f"Seeded usage: {usage.used_count} for Tenant: {t.name} ({t.id})")
else:
    print("No tenants found.")
