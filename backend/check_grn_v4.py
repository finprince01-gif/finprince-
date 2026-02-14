import os
import django
import sys

# Ensure current directory is in sys.path
sys.path.append(os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import User
from inventory.models import InventoryMasterGRN


grns = list(InventoryMasterGRN.objects.all())
grn_tenants = [g.tenant_id for g in grns]

for user in User.objects.all():
    if user.tenant_id in grn_tenants:

    else:
        pass # print(f"MISMATCH: User: {user.username}, Tenant ID: {user.tenant_id}")


for grn in grns:

