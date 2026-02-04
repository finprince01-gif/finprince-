
import os
import django
import sys

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from customerportal.models import CustomerMasterLongTermContractBasicDetail
from django.contrib.auth import get_user_model

with open('debug_contracts_out.txt', 'w', encoding='utf-8') as f:
    f.write("START SCRIPT\n")
    try:
        contracts = CustomerMasterLongTermContractBasicDetail.objects.all()
        f.write(f"COUNT: {contracts.count()}\n")

        for c in contracts:
            f.write(f"Contract: {c.id} | No: {c.contract_number} | Tenant: {c.tenant_id} | Deleted: {c.is_deleted}\n")

        User = get_user_model()
        users = User.objects.all()
        f.write(f"USER COUNT: {users.count()}\n")
        for u in users:
            t_id = getattr(u, 'tenant_id', 'None')
            f.write(f"User: {u.username} | ID: {u.id} | Tenant: {t_id}\n")

    except Exception as e:
        f.write(f"ERROR: {e}\n")

    f.write("END SCRIPT\n")
