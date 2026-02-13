"""
Login Database Layer - Pure Data Access
NO business logic, NO RBAC, NO tenant validation.
Only database queries.
"""

import logging
logger = logging.getLogger('login.database')


# ============================================================================
# USER QUERIES
# ============================================================================

def get_user_by_username(username):
    """Get user by username."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        return User.objects.filter(username=username)
    except Exception as e:
        logger.error(f"Error fetching user by username: {e}")
        return None

def get_user_by_email(email):
    """Get user by email."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        return User.objects.get(email=email)
    except User.DoesNotExist:
        return None
    except Exception as e:
        logger.error(f"Error fetching user by email: {e}")
        return None

def get_users_by_identifier(identifier):
    """Get users by email or phone."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    from django.db.models import Q
    try:
        return User.objects.filter(Q(email=identifier) | Q(phone=identifier))
    except Exception as e:
        logger.error(f"Error fetching users by identifier: {e}")
        return []

def get_user_by_username_and_identifier(username, identifier):
    """Get single user by username and email/phone."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    from django.db.models import Q
    try:
        return User.objects.get(
            Q(username=username) & (Q(email=identifier) | Q(phone=identifier))
        )
    except User.DoesNotExist:
        return None
    except Exception as e:
        logger.error(f"Error fetching user by username/identifier: {e}")
        return None


# ============================================================================
# OTP QUERIES
# ============================================================================

def create_otp(user, otp_hash, expires_at):
    """Create a new OTP record."""
    from core.models import PasswordResetOTP
    try:
        # Invalidate previous OTPs
        PasswordResetOTP.objects.filter(user=user, used=False).update(used=True)
        
        return PasswordResetOTP.objects.create(
            user=user,
            otp_hash=otp_hash,
            expires_at=expires_at
        )
    except Exception as e:
        logger.error(f"Error creating OTP: {e}")
        return None

def get_active_otp_by_user(user):
    """Get the current active OTP for a user."""
    from core.models import PasswordResetOTP
    from django.utils import timezone
    try:
        return PasswordResetOTP.objects.filter(
            user=user,
            used=False,
            expires_at__gt=timezone.now()
        ).first()
    except Exception as e:
        logger.error(f"Error fetching active OTP: {e}")
        return None

def mark_otp_used(otp_record):
    """Mark an OTP as used."""
    try:
        otp_record.used = True
        otp_record.save()
        return True
    except Exception as e:
        logger.error(f"Error marking OTP as used: {e}")
        return False

def increment_otp_attempts(otp_record):
    """Increment attempts for an OTP."""
    try:
        otp_record.attempts += 1
        otp_record.save()
        return otp_record.attempts
    except Exception as e:
        logger.error(f"Error incrementing OTP attempts: {e}")
        return None
