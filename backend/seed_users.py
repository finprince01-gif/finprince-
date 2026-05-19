import os
import django
import json

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import User, Tenant, MasterUser
from rbac.models import Role, UserRole

def seed_data():
    print("Starting comprehensive seed process...")
    
    # 1. Create a Master User if not exists
    master_user, created = MasterUser.objects.get_or_create(
        username='john',
        defaults={
            'email': 'john@gmail.com',
            'name': 'John Doe',
            'is_active': True
        }
    )
    if created:
        master_user.set_password('admin123')
        master_user.save()
        print(f"Created Master User: {master_user.username}")
    else:
        print(f"Master User {master_user.username} already exists.")

    # 2. Create a Tenant
    tenant_id = '2eda0ac6-6af2-493e-8792-bc973fe946b7'
    tenant, created = Tenant.objects.get_or_create(
        id=tenant_id,
        defaults={
            'name': 'Buds Tech Consultancy',
            'master': master_user,
            'is_active': True
        }
    )
    if created:
        print(f"Created Tenant: {tenant.name}")
    else:
        print(f"Tenant {tenant.name} already exists.")

    # 3. Create RBAC Roles
    admin_perms = {
        "Inventory": {"view": True, "tabs": {"Master": True, "Operations": True, "Reports": True}},
        "Vouchers": {"view": True, "tabs": {"Sales": True, "Purchase": True, "Payment": True, "Receipt": True, "Contra": True, "Journal": True, "Debit Note": True, "Credit Note": True}},
        "Masters": {"view": True, "tabs": {"Ledgers": True, "Groups": True, "Vouchers": True}},
        "Reports": {"view": True, "tabs": {"Balance Sheet": True, "Profit & Loss": True, "Ledger Report": True}},
        "Settings": {"view": True, "tabs": {"General": True, "Users": True, "Roles": True}}
    }
    
    acc_perms = {
        "Inventory": {"view": True, "tabs": {"Master": True, "Operations": True, "Reports": True}},
        "Vouchers": {"view": True, "tabs": {"Sales": True, "Purchase": True, "Payment": True, "Receipt": True, "Contra": True, "Journal": True}},
        "Masters": {"view": True, "tabs": {"Ledgers": True, "Groups": True}},
        "Reports": {"view": True, "tabs": {"Ledger Report": True}}
    }

    roles_to_seed = [
        {'name': 'Admin', 'description': 'Full access to all modules', 'permissions': admin_perms},
        {'name': 'Accountant', 'description': 'Access to accounts and inventory', 'permissions': acc_perms}
    ]

    role_objs = {}
    for r_data in roles_to_seed:
        role, created = Role.objects.get_or_create(
            name=r_data['name'],
            tenant_id=tenant_id,
            defaults={
                'description': r_data['description'],
                'permissions': r_data['permissions']
            }
        )
        role_objs[r_data['name']] = role
        if created:
            print(f"Created Role: {role.name}")
        else:
            print(f"Role {role.name} already exists.")

    # 4. Create Users and Assign Roles
    seed_users = [
        {
            'username': 'admin',
            'email': 'admin@budstech.com',
            'password': 'admin123',
            'full_name': 'System Administrator',
            'company_name': 'Buds Tech Consultancy',
            'role_choice': 'COMPANY_ADMIN',
            'rbac_roles': ['Admin'],
            'is_staff': True,
            'is_superuser': True
        },
        {
            'username': 'accountant',
            'email': 'acc@budstech.com',
            'password': 'admin123',
            'full_name': 'Senior Accountant',
            'company_name': 'Buds Tech Consultancy',
            'role_choice': 'BRANCH_USER',
            'rbac_roles': ['Accountant'],
            'is_staff': False,
            'is_superuser': False
        }
    ]

    for user_data in seed_users:
        user, created = User.objects.get_or_create(
            username=user_data['username'],
            defaults={
                'email': user_data['email'],
                'full_name': user_data['full_name'],
                'company_name': user_data['company_name'],
                'role': user_data['role_choice'],
                'is_staff': user_data['is_staff'],
                'is_superuser': user_data['is_superuser'],
                'tenant_id': tenant_id
            }
        )
        if created:
            user.set_password(user_data['password'])
            user.save()
            print(f"Created User: {user.username}")
        else:
            print(f"User {user.username} already exists.")
        
        # Assign RBAC Roles
        for r_name in user_data['rbac_roles']:
            ur, ur_created = UserRole.objects.get_or_create(
                user=user,
                role=role_objs[r_name],
                tenant_id=tenant_id,
                defaults={
                    'username': user.username,
                    'email': user.email
                }
            )
            if ur_created:
                print(f"Assigned Role {r_name} to {user.username}")

    print("Seed process completed successfully!")

if __name__ == '__main__':
    seed_data()
