import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from inventory.models import InventoryMasterGRN

print("Checking InventoryMasterGRN entries:")
grns = InventoryMasterGRN.objects.all()
print(f"Total count: {grns.count()}")
for grn in grns:
    print(f"ID: {grn.id}, Name: {grn.name}, Tenant ID: {grn.tenant_id}, Is Active: {grn.is_active}")
