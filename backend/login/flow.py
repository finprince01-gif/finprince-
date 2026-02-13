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
                return None, "Invalid password"
        else:
            return None, "No account found with this username"

    if user is None:
        # This part should ideally not be reached if either email or username was provided
        # but as a fallback:
        if email:
            return None, "No account found with this email"
        if username:
            return None, "No account found with this username"
        return None, "Invalid login details"
    
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

def forgot_user_id(identifier):
    """Business logic for retrieving User IDs."""
    users = database.get_users_by_identifier(identifier)
    if not users:
        return None, "No account found with this information"
    
    user_ids = [u.username for u in users]
    # Return masked IDs for demo purposes
    masked_ids = [uid[:2] + '*' * (len(uid)-2) for uid in user_ids]
    
    return masked_ids, "User ID(s) found"

def reset_password(username, identifier, new_password):
    """Business logic for resetting password."""
    user = database.get_user_by_username_and_identifier(username, identifier)
    if not user:
        return False, "No matching account found with these details"
    
    from django.contrib.auth.hashers import make_password
    user.password = make_password(new_password)
    user.save()
    
    logger.info(f"🔑 Password reset for user: {username}")
    return True, "Password has been reset successfully"

def request_reset_otp(email):
    """
    Handle OTP request for password reset.
    Returns: (success_bool, message)
    """
    import random
    from django.utils import timezone
    from datetime import timedelta
    from django.contrib.auth.hashers import make_password
    from django.core.mail import send_mail
    from django.conf import settings

    user = database.get_user_by_email(email)
    
    if not user:
        return False, "This email address is not registered."

    # Generate 6-digit OTP
    otp = f"{random.randint(100000, 999999)}"
    otp_hash = make_password(otp)
    expires_at = timezone.now() + timedelta(minutes=5)

    # Store OTP in DB (this also invalidates previous ones)
    database.create_otp(user, otp_hash, expires_at)

    # Send OTP to email
    try:
        send_mail(
            subject="Your Password Reset Code",
            message=f"Your OTP is {otp}. It will expire in 5 minutes.",
            from_email=None,
            recipient_list=[user.email],
            fail_silently=False
        )
        logger.info(f"OTP sent to {user.email}")
    except Exception as e:
        logger.error(f"Failed to send OTP email: {e}")
        # We still return success to the user to avoid leaking account existence
    
    return True, "A verification code has been sent to your email."

def verify_reset_otp(email, otp, new_password):
    """
    Verify OTP and reset password.
    Returns: (success_bool, message)
    """
    from django.contrib.auth.hashers import check_password, make_password
    from django.utils import timezone

    user = database.get_user_by_email(email)
    if not user:
        return False, "Invalid request"

    otp_record = database.get_active_otp_by_user(user)
    
    if not otp_record:
        return False, "OTP expired or not found. Please request a new one."

    if otp_record.attempts >= 5:
        database.mark_otp_used(otp_record)
        return False, "Too many failed attempts. Please request a new one."

    if not check_password(otp, otp_record.otp_hash):
        database.increment_otp_attempts(otp_record)
        return False, "Invalid verification code"

    # Success: Reset password
    user.password = make_password(new_password)
    user.save()

    # Mark OTP as used
    database.mark_otp_used(otp_record)
    
    # Revoke sessions: Changing the password naturally invalidates the session 
    # and if the JWT payload includes a hash of the password or similar, it would invalidate tokens.
    # For standard Django sessions, it invalidates. For JWT, usually blacklisting is needed.
    
    logger.info(f"Password reset successful for {email}")
    return True, "Your password has been successfully reset."

def verify_otp_only(email, otp):
    """
    Verify OTP without resetting password.
    Returns: (success_bool, message)
    """
    from django.contrib.auth.hashers import check_password
    
    user = database.get_user_by_email(email)
    if not user:
        return False, "Invalid request"

    otp_record = database.get_active_otp_by_user(user)
    
    if not otp_record:
        return False, "OTP expired or not found. Please request a new one."

    if otp_record.attempts >= 5:
        database.mark_otp_used(otp_record)
        return False, "Too many failed attempts. Please request a new one."

    if not check_password(otp, otp_record.otp_hash):
        database.increment_otp_attempts(otp_record)
        return False, "Invalid verification code"

    return True, "Verification successful"
