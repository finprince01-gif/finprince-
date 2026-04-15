
import logging
from django.db import transaction
from django.contrib.auth.hashers import make_password
from rest_framework import serializers
from . import master_db as db
from .models import User, Branch
import uuid

logger = logging.getLogger('core.master_flow')

def list_branches(master_user):
    """List all branches for a master admin."""
    return db.get_master_branches(master_user)

def provision_branch(master_user, data):
    """
    Handle the full flow of provisioning a new branch:
    1. Validation
    2. GSTIN / Email conflict checks
    3. Creation (Atomic)
    4. Seeding
    """
    branch_name = data.get('name')
    business_type = data.get('business_type')
    branch_gstin = data.get('gstin', '').upper()
    email = data.get('email')
    phone = data.get('phone')
    owner_data = data.get('owner', {})
    
    # 1. Validation
    required = [branch_name, business_type, branch_gstin, owner_data.get('username'), owner_data.get('password'), owner_data.get('name')]
    if not all(required):
        raise serializers.ValidationError("Missing required fields for branch provisioning.")

    # 2. Conflict Checks
    if Branch.objects.filter(gstin=branch_gstin).exists():
        raise serializers.ValidationError(f"GSTIN {branch_gstin} is already registered.")

    admin_email = owner_data.get('email', email)
    if admin_email and User.objects.filter(email=admin_email).exists():
        raise serializers.ValidationError(f"Email {admin_email} is already in use.")

    if User.objects.filter(username=owner_data.get('username')).exists():
        raise serializers.ValidationError(f"Username {owner_data.get('username')} is already taken.")

    # 3. Prepare Data
    unique_tenant_name = branch_name
    if Branch.objects.filter(name=branch_name).exists():
        unique_tenant_name = f"{branch_name}-{branch_gstin}" if branch_gstin else f"{branch_name}-{uuid.uuid4().hex[:8]}"

    branch_payload = {
        'name': unique_tenant_name,
        'branch_name': branch_name,
        'business_type': business_type,
        'gstin': branch_gstin,
        'email': email,
        'phone': phone,
        'address_line1': data.get('address_line1'),
        'address_line2': data.get('address_line2'),
        'address_line3': data.get('address_line3'),
        'country': data.get('country', 'India'),
        'state': data.get('state'),
        'district': data.get('district'),
        'city': data.get('city'),
        'pincode': data.get('pincode')
    }

    admin_payload = {
        'username': owner_data['username'],
        'full_name': owner_data.get('name'),
        'email': admin_email,
        'password': make_password(owner_data['password']),
        'company_name': branch_name,
        'phone': phone,
        'role': 'COMPANY_ADMIN',
        'selected_plan': data.get('selected_plan', 'FREE'),
        'is_active': True,
        'is_superuser': True
    }

    # 4. Create
    branch, user = db.create_branch_with_admin(branch_payload, admin_payload, master_user)
    
    # 5. Seed
    try:
        from .tenant_seed import seed_tenant_data
        seed_tenant_data(branch.id)
    except Exception as e:
        logger.error(f"Seeding failed for branch {branch.id}: {e}")

    return branch

def get_branch_metrics(master_user, tenant_id):
    """Retrieve drill-down metrics for a branch."""
    branch = db.get_branch_by_id(tenant_id, master_user)
    owner = User.objects.filter(tenant_id=branch.id, role='COMPANY_ADMIN', is_superuser=True).first()
    if not owner:
        owner = User.objects.filter(tenant_id=branch.id).first()
        
    from accounting.models import Voucher
    invoices_count = Voucher.objects.filter(tenant_id=branch.id).count()
    
    return {
        'branch': branch,
        'owner': owner,
        'metrics': {
            'invoices_generated': invoices_count,
            'ai_credits_used': int(invoices_count * 1.5)
        }
    }

def update_branch_settings(master_user, tenant_id, data):
    """Handle branch setting updates."""
    # Mapping logic for 'action' based updates if needed
    action = data.get('action')
    if action == 'toggle_status':
        return db.toggle_branch_status(tenant_id, master_user)
    
    # Standard field updates
    branch_data = {
        'name': data.get('name'),
        'pan_number': data.get('pan_number'),
        'email': data.get('email'),
        'phone': data.get('phone'),
        'address_line1': data.get('address'),
        'state': data.get('state'),
        'city': data.get('city'),
        'pincode': data.get('pincode')
    }
    # Filter out None values
    branch_data = {k: v for k, v in branch_data.items() if v is not None}
    
    return db.update_branch(tenant_id, branch_data, master_user)

def reset_branch_password(master_user, tenant_id, new_password):
    """Flow for resetting branch passwords."""
    if len(new_password) < 8:
        raise serializers.ValidationError("Password must be at least 8 characters.")
    
    hashed = make_password(new_password)
    return db.reset_branch_users_password(tenant_id, hashed, master_user)
