"""
Registration Database Layer - Pure Data Access
NO business logic, NO RBAC, NO tenant validation.
Only database queries.
"""

import logging
import uuid
logger = logging.getLogger('registration.database')


# ============================================================================
# USER QUERIES
# ============================================================================

def check_username_exists(username):
    """Check if username exists."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.filter(username=username).exists()


def check_phone_exists(phone):
    """Check if phone exists."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.filter(phone=phone).exists()


def create_user(username, email, password_hash, company_name, phone, selected_plan, tenant_id, logo_path=None):
    """Create a new user."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create(
        username=username,
        email=email,
        password=password_hash,  # Already hashed
        company_name=company_name,
        phone=phone,
        phone_verified=True,
        selected_plan=selected_plan,
        tenant_id=tenant_id,
        logo_path=logo_path,
        is_active=True,
        is_superuser=True,  # Branch owner is superuser
        is_staff=True  # Also grant staff access
    )



# ============================================================================
# TENANT QUERIES
# ============================================================================

def create_tenant(company_name):
    """Create a new tenant."""
    from core.models import Branch
    tenant_uuid = str(uuid.uuid4())
    tenant = Branch.objects.create(id=tenant_uuid, name=company_name)
    return tenant


# ============================================================================
# DEFAULT DATA SEEDING
# ============================================================================

def seed_default_ledger_groups(tenant_id):
    """Seed default ledger groups for a new tenant."""
    from accounting.models import MasterLedgerGroup
    
    default_groups = [
        # Assets
        {'name': 'Current Assets'},
        {'name': 'Fixed Assets'},
        {'name': 'Sundry Debtors', 'parent': 'Current Assets'},
        {'name': 'Bank Accounts', 'parent': 'Current Assets'},
        {'name': 'Cash-in-Hand', 'parent': 'Current Assets'},
        
        # Liabilities
        {'name': 'Current Liabilities'},
        {'name': 'Sundry Creditors', 'parent': 'Current Liabilities'},
        {'name': 'Duties & Taxes', 'parent': 'Current Liabilities'},
        
        # Income
        {'name': 'Sales Accounts'},
        {'name': 'Direct Incomes'},
        {'name': 'Indirect Incomes'},
        
        # Expenses
        {'name': 'Purchase Accounts'},
        {'name': 'Direct Expenses'},
        {'name': 'Indirect Expenses'},
    ]
    
    for group_data in default_groups:
        group_kwargs = {
            'tenant_id': tenant_id,
            'name': group_data['name'],
        }
        
        if 'parent' in group_data:
            group_kwargs['parent'] = group_data['parent']
            
        try:
            MasterLedgerGroup.objects.create(**group_kwargs)
        except Exception as e:
            logger.warning(f"Failed to seed group {group_data['name']}: {e}")
