
import os
import django
import sys

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from customerportal.models import CustomerMasterLongTermContractBasicDetail
from django.contrib.auth import get_user_model

print("START SCRIPT")
try:
    contracts = CustomerMasterLongTermContractBasicDetail.objects.all()
    print("Queryset created")
    count = contracts.count()
    print(f"COUNT: {count}")

    for c in contracts:
        print(f"Contract: {c.id} | {c.contract_number} | {c.tenant_id}")

    User = get_user_model()
    users = User.objects.all()
    print(f"USER COUNT: {users.count()}")
    for u in users:
        t_id = getattr(u, 'tenant_id', 'None')
        print(f"User: {u.username} | Tenant: {t_id}")

except Exception as e:
    print(f"ERROR: {e}")

print("END SCRIPT")
