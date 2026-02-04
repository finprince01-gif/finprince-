
import os
import django
import sys

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from customerportal.models import CustomerMasterLongTermContractBasicDetail
from django.contrib.auth import get_user_model

print("Checking CustomerMasterLongTermContractBasicDetail table...")
contracts = CustomerMasterLongTermContractBasicDetail.objects.all()
print(f"Total contracts found: {contracts.count()}")

for contract in contracts:
    print("-" * 30)
    print(f"ID: {contract.id}")
    print(f"Contract No: {contract.contract_number}")
    print(f"Customer Name: {contract.customer_name}")
    print(f"Tenant ID: {contract.tenant_id}")
    print(f"Is Deleted: {contract.is_deleted}")
    print(f"Created By: {contract.created_by}")

User = get_user_model()
print("\nChecking Users and Tenant IDs...")
for user in User.objects.all():
    tenant_id = getattr(user, 'tenant_id', 'N/A')
    print(f"User: {user.username}, Tenant ID: {tenant_id}")
