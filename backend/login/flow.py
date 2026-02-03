"""
Login Flow Layer - Business Logic
NO RBAC needed (authentication is public), NO tenant validation.
Business logic for login and token management.
"""

import logging
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken
from core.token import MyTokenObtainPairSerializer
logger = logging.getLogger('login.flow')

# ============================================================================
# LOGIN OPERATIONS
# ============================================================================

def authenticate_user(username, password, email=None):
    """
    Authenticate user with username/email and password.
    
    Args:
        username: Username
        password: Plain text password
        email: Optional email for disambiguation in multi-tenant setups
    
    Returns:
        tuple: (user, token_data) if successful, (None, error_message) if failed
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    # Try email-based authentication first (more specific in multi-tenant)
    if email:
        try:
            user = User.objects.get(email=email)
            if user.check_password(password):
                if not user.is_active:
                    return None, "Account is inactive"
                # Email authentication successful, generate tokens
                refresh = MyTokenObtainPairSerializer.get_token(user)
                access_token = str(refresh.access_token)
                refresh_token = str(refresh)
                
                token_data = {
                    'access': access_token,
                    'refresh': refresh_token,
                    'username': user.username,
                    'email': getattr(user, 'email', ''),
                    'tenant_id': user.tenant_id,
                    'company_name': getattr(user, 'company_name', ''),
                }
                
                logger.info(
                    f"🔐 LOGIN SUCCESS (Email) - {timezone.localtime().strftime('%Y-%m-%d %H:%M:%S')} | "
                    f"Tenant: {user.tenant_id} ({token_data['company_name']}) | "
                    f"User: {user.username} ({token_data['email']})"
                )
                
                return user, token_data
            else:
                return None, "Invalid credentials"
        except User.DoesNotExist:
            # Email not found, fall through to username authentication
            pass
        except User.MultipleObjectsReturned:
            # This shouldn't happen if email is unique, but handle it
            logger.error(f"Multiple users found with email {email}")
            return None, "Email authentication error. Please contact support."
    
    # Fallback to username-based authentication
    users = User.objects.filter(username=username)
    user = None
    
    for u in users:
        if u.check_password(password):
            if user is not None:
                # Ambiguity: same username/password in multiple tenants
                # Suggest using email for login
                logger.warning(f"Ambiguous login for {username}: Multiple users found with same password.")
                return None, "Multiple accounts found with this username. Please use your email address to log in."
            user = u
            
    if user is None:
        # No user found or password incorrect
        return None, "Invalid credentials"
    
    if not user.is_active:
        return None, "Account is inactive"
    
    # Generate tokens
    refresh = MyTokenObtainPairSerializer.get_token(user)
    access_token = str(refresh.access_token)
    refresh_token = str(refresh)

    
    token_data = {
        'access': access_token,
        'refresh': refresh_token,
        'username': user.username,
        'email': getattr(user, 'email', ''),
        'tenant_id': user.tenant_id,
        'company_name': getattr(user, 'company_name', ''),
    }
    
    # Log login
    logger.info(
        f"🔐 LOGIN SUCCESS - {timezone.localtime().strftime('%Y-%m-%d %H:%M:%S')} | "
        f"Tenant: {user.tenant_id} ({token_data['company_name']}) | "
        f"User: {user.username} ({token_data['email']})"
    )
    
    return user, token_data


def refresh_access_token(refresh_token):
    """
    Refresh access token.
    
    Args:
        refresh_token: Refresh token string
    
    Returns:
        dict: New tokens or None if failed
    """
    from rest_framework_simplejwt.tokens import RefreshToken as JWT_RefreshToken
    
    try:
        refresh = JWT_RefreshToken(refresh_token)
        access_token = str(refresh.access_token)
        
        return {
            'access': access_token,
            'refresh': str(refresh)  # May be rotated
        }
    except Exception as e:
        logger.error(f"Token refresh failed: {e}")
        return None
