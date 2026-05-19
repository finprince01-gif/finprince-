import os
import django
import uuid

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import User, Tenant

def seed_stress_users(count=50):
    # Ensure stress tenant exists
    tenant_id = "STRESS_BRANCH"
    branch_email = "stress_branch@finpixe.com"
    tenant, _ = Tenant.objects.get_or_create(
        id=tenant_id,
        defaults={
            "name": "STRESS_CORP", 
            "email": branch_email,
            "is_active": True
        }
    )
    
    # Update email if already exists
    tenant.email = branch_email
    tenant.save()
    
    print(f"Using Tenant: {tenant.id}, Email: {tenant.email}")

    for i in range(count):
        user_id_str = f"stress_test_{i}@finpixe.com"
        user, created = User.objects.get_or_create(
            username=user_id_str, # In this system, username is the identifier
            tenant_id=tenant.id,
            defaults={
                "email": user_id_str,
                "is_active": True,
                "company_name": "STRESS_CORP"
            }
        )
        if created:
            user.set_password("Password123")
            user.save()
            print(f"Created user: {user_id_str}")
        else:
            user.set_password("Password123")
            user.save()
            print(f"User already exists and updated: {user_id_str}")

if __name__ == "__main__":
    seed_stress_users(50)
