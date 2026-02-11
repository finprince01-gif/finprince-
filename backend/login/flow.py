"""
Login Flow Layer - Business Logic
NO RBAC needed (authentication is public), NO tenant validation.
Business logic for login and token management.
"""

import logging
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken
from core.token import MyTokenObtainPairSerializer
from . import database

utils_logger = logging.getLogger('login.flow')
logger = logging.getLogger('login.flow')

def authenticate_user(username, password, email=None):
    """
    Authenticate user with username/email and password.
    Checks credentials against the database.
    
    Args:
        username: Username
        password: Plain text password
        email: Optional email for primary authentication
    
    Returns:
        tuple: (user, token_data) if successful, (None, error_message) if failed
    """
    user = None
    
    # 1. Primary Check: Email (Globally unique)
    if email:
        user = database.get_user_by_email(email)
        if user:
            # If user found by email, verify password
            if not user.check_password(password):
                return None, "Invalid password"
            
            # If username also provided, it must match
            if username and user.username != username:
                return None, "Username does not match the account for this email"
        elif not username:
             return None, "No account found with this email"
    
    # 2. Secondary Check: Username (if not already authenticated by email)
    if not user and username:
        users = database.get_user_by_username(username)
        if users:
            matched_users = []
            for u in users:
                if u.check_password(password):
                    matched_users.append(u)
            
            if len(matched_users) > 1:
                logger.warning(f"Ambiguous login for {username}: Multiple accounts found.")
                return None, "Multiple accounts found with this username. Please use your email to log in."
            elif len(matched_users) == 1:
                user = matched_users[0]
            else:
                return None, "Invalid credentials"
        else:
            return None, "No account found with this username"

    if user is None:
        return None, "Invalid credentials"
    
    if not user.is_active:
        return None, "Account is inactive"
    
    # Generate tokens and build response
    refresh = MyTokenObtainPairSerializer.get_token(user)
    
    token_data = {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'username': user.username,
        'email': getattr(user, 'email', ''),
        'tenant_id': user.tenant_id,
        'company_name': getattr(user, 'company_name', ''),
        'selected_plan': getattr(user, 'selected_plan', 'Free'),
    }
    
    # Log success
    logger.info(
        f"🔐 LOGIN SUCCESS - {timezone.localtime().strftime('%Y-%m-%d %H:%M:%S')} | "
        f"Tenant: {user.tenant_id} | User: {user.username}"
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
