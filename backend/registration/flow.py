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
                phone_verified=True,  # No OTP for direct registration
                is_active=True,
                is_superuser=True,  # All users are superusers (RBAC removed)
            )
            
            from django.db import connection
            db_name = connection.settings_dict['NAME']
            logger.info(f"✅ User {user.id} created successfully with tenant {tenant_id} in DB: {db_name}")
        
        # Seed tenant data (Outside atomic block to prevent rollback on seeding failure)
        # Seeding errors are caught inside the function
        seed_tenant_data(tenant_id)
        
        # Auto-login: Generate JWT tokens
        refresh = MyTokenObtainPairSerializer.get_token(user)
        access_token = str(refresh.access_token)
        

        
        logger.info(f"✅ Auto-login: Generated JWT token")
        
        # Build response data
        response_data = {
            'success': True,
            'message': 'Registration successful. Account details have been sent to your email.',
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

        # Send confirmation email
        if email:
            try:
                from django.core.mail import send_mail
                from django.conf import settings
                
                subject = "Your Finpixe Account Registration Details"
                email_message = (
                    f"Hi {username},\n\n"
                    f"Your registration was successful.\n\n"
                    f"Here are your login details:\n\n"
                    f"Username: {username}\n"
                    f"Email: {email}\n"
                    f"Password: {password}\n\n"
                    f"You can now log in to your account.\n\n"
                    f"If you did not create this account, please contact support immediately."
                )
                
                send_mail(
                    subject=subject,
                    message=email_message,
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@finpixe.com'),
                    recipient_list=[email],
                    fail_silently=False,
                )
                logger.info(f"✅ Registration email sent to {email}")
            except Exception as mail_err:
                logger.error(f"❌ Failed to send registration email to {email}: {mail_err}")

        return response_data
        
    except Exception as e:
        logger.error(f"❌ Error during registration: {e}")
        import traceback
        traceback.print_exc()
        raise
