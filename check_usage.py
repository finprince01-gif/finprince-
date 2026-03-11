import os
import django
import sys

# Set up Django environment
sys.path.append('c:/108/muthu/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import AIUsage, User, Tenant
from datetime import datetime

print(f"Current Time: {datetime.now()}")
print(f"AIUsage Count: {AIUsage.objects.count()}")

usage_records = AIUsage.objects.all()
for u in usage_records:
    print(f"Tenant: {u.tenant_id}, Year: {u.year}, Month: {u.month}, Used: {u.used_count}")

print(f"\nUsers and their Tenant IDs:")
for user in User.objects.all()[:10]:
    print(f"User: {user.username}, Tenant: {user.tenant_id}")

print(f"\nTenants:")
for t in Tenant.objects.all()[:10]:
    print(f"Tenant ID: {t.id}, Name: {t.name}")
