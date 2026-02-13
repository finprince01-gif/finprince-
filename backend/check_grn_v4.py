import os
import django
import sys

# Ensure current directory is in sys.path
sys.path.append(os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import User
from inventory.models import InventoryMasterGRN

print("--- Users matching GRN tenant ---")
grns = list(InventoryMasterGRN.objects.all())
grn_tenants = [g.tenant_id for g in grns]

for user in User.objects.all():
    if user.tenant_id in grn_tenants:
        print(f"MATCH: User: {user.username}, Tenant ID: {user.tenant_id}")
    else:
        pass # print(f"MISMATCH: User: {user.username}, Tenant ID: {user.tenant_id}")

print("\n--- InventoryMasterGRN ---")
for grn in grns:
    print(f"ID: {grn.id}, Name: {grn.name}, Tenant ID: {grn.tenant_id}, Is Active: {grn.is_active}")
