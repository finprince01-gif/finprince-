"""
Registration Flow Layer - Business Logic
NO RBAC needed (registration is public), NO tenant validation (creating tenants).
Business logic for user registration.
"""

import logging
import uuid
from django.contrib.auth.hashers import make_password
from django.core.files.storage import default_storage
from django.utils import timezone
from django.db import transaction
from core.token import MyTokenObtainPairSerializer

logger = logging.getLogger(__name__)

def register_user(registration_data):
    """
    Register a new user and create their tenant.
    Returns JWT tokens for auto-login.
    """
    try:
        from core.models import User, Tenant
        from core.tenant_seed import seed_tenant_data
        
        # Extract registration data
        username = registration_data.get('username')
        email = registration_data.get('email')
        password = registration_data.get('password')
        company_name = registration_data.get('company_name')
        phone = registration_data.get('phone')
        selected_plan = registration_data.get('selected_plan', 'Free')
        
        # Generate tenant ID
        tenant_id = str(uuid.uuid4())
        
        # Create user with transaction
        with transaction.atomic():
            # Create Tenant first to satisfy FK constraint
            Tenant.objects.create(
                id=tenant_id,
                name=company_name
            )

            user = User.objects.create(
                username=username,
                email=email,
                password=make_password(password),
                company_name=company_name,
                phone=phone,
                tenant_id=tenant_id,
                selected_plan=selected_plan,
                is_active=True,
                is_superuser=True,  # All users are superusers (RBAC removed)
            )
            
            # Seed tenant data
            seed_tenant_data(tenant_id)
            
            logger.info(f"✅ User {user.id} created successfully with tenant {tenant_id}")
        
        # Auto-login: Generate JWT tokens
        refresh = MyTokenObtainPairSerializer.get_token(user)
        access_token = str(refresh.access_token)
        

        
        logger.info(f"✅ Auto-login: Generated JWT token")
        
        # Build response data
        response_data = {
            'success': True,
            'message': 'Registration successful! You are now logged in.',
            'access': access_token,
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'company_name': user.company_name,
                'phone': user.phone,
                'tenant_id': user.tenant_id,
                'selected_plan': user.selected_plan,
            },
        }
        
        logger.info(f"✅ Registration complete - User {user.id} successfully saved")
        return response_data
        
    except Exception as e:
        logger.error(f"❌ Error during registration: {e}")
        import traceback
        traceback.print_exc()
        raise
