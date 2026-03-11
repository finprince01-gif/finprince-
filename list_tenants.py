import os
import django
import sys

# Set up Django environment
sys.path.append('c:/108/muthu/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import Tenant, User

print("Tenants in DB:")
for t in Tenant.objects.all():
    print(f"ID: {t.id}, Name: {t.name}")

print("\nUsers and their Tenants:")
for u in User.objects.all():
    print(f"User: {u.username}, Tenant ID: {u.tenant_id}")
