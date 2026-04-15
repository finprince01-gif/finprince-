"""
Login Database Layer - Pure Data Access
NO business logic, NO RBAC, NO tenant validation.
Only database queries.
"""

import logging
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger('login.database')

# ============================================================================
# CONSTANTS
# ============================================================================

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 5


# ============================================================================
# USER QUERIES
# ============================================================================

def get_user_by_username(username):
    """Get user(s) by username (username is NOT globally unique)."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        return User.objects.filter(username=username)
    except Exception as e:
        logger.error(f"Error fetching user by username: {e}")
        return None


def get_user_by_email(email):
    """Get user by email (email IS globally unique)."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        return User.objects.get(email=email)
    except User.DoesNotExist:
        return None
    except Exception as e:
        logger.error(f"Error fetching user by email: {e}")
        return None

def get_user_by_email_and_username(email, username):
    """Get user by branch email+username OR user email+username."""
    from django.contrib.auth import get_user_model
    from core.models import Branch
    User = get_user_model()
    try:
        # Primary path: branch email identifies tenant, username identifies user inside tenant
        branch = Branch.objects.filter(email=email).first()
        if branch:
            user = User.objects.filter(username=username, tenant_id=branch.id).first()
            if user:
                return user

        # Fallback path: allow direct login by created user's email + username
        return User.objects.filter(email=email, username=username).first()
    except User.DoesNotExist:
        return None
    except Exception as e:
        logger.error(f"Error fetching user by email and username: {e}")
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
# RATE LIMITING QUERIES (in-memory cache — no extra DB table required)
# ============================================================================

def get_failed_attempt_count(email):
    """
    Return (attempt_count, locked_until) for the given email.
    Uses Django's in-memory/local-mem cache.
    Returns (0, None) if no record exists.
    """
    from django.core.cache import cache

    key_attempts  = f"login_attempts:{email}"
    key_locked    = f"login_locked:{email}"

    attempt_count = cache.get(key_attempts, 0)
    locked_until  = cache.get(key_locked, None)

    return attempt_count, locked_until


def record_failed_attempt(email, ip_address):
    """
    Increment failed-attempt counter for email.
    Locks the account when MAX_FAILED_ATTEMPTS is reached.
    """
    from django.core.cache import cache

    key_attempts = f"login_attempts:{email}"
    key_locked   = f"login_locked:{email}"

    # Increment (thread-safe add / incr)
    try:
        attempt_count = cache.incr(key_attempts)
    except ValueError:
        # Key doesn't exist yet
        cache.set(key_attempts, 1, timeout=LOCKOUT_MINUTES * 60 * 2)  # Keep for 2x lockout window
        attempt_count = 1

    logger.warning(
        f"⚠ Failed attempt #{attempt_count} | Email: {email} | IP: {ip_address}"
    )

    if attempt_count >= MAX_FAILED_ATTEMPTS:
        locked_until = timezone.now() + timedelta(minutes=LOCKOUT_MINUTES)
        cache.set(key_locked, locked_until, timeout=LOCKOUT_MINUTES * 60)
        logger.warning(
            f"🔒 Account LOCKED | Email: {email} | Until: {locked_until} | IP: {ip_address}"
        )


def reset_failed_attempts(email):
    """Clear failed-attempt counter after successful login."""
    from django.core.cache import cache

    cache.delete(f"login_attempts:{email}")
    cache.delete(f"login_locked:{email}")
    logger.info(f"✅ Failed attempts cleared for: {email}")


# ============================================================================
# OTP QUERIES
# ============================================================================

def create_otp(user, otp_hash, expires_at):
    """Create a new OTP record (invalidates previous ones)."""
    from core.models import PasswordResetOTP
    try:
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
