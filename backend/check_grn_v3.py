import os
import django
import sys

# Ensure current directory is in sys.path
sys.path.append(os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import User
from inventory.models import InventoryMasterGRN

print("--- Users ---")
for user in User.objects.all():
    print(f"User: {user.username}, Tenant ID: {user.tenant_id}")

print("\n--- InventoryMasterGRN ---")
for grn in InventoryMasterGRN.objects.all():
    print(f"ID: {grn.id}, Name: {grn.name}, Tenant ID: {grn.tenant_id}, Is Active: {grn.is_active}")
