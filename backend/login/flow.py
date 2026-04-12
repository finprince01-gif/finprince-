"""
Login Flow Layer - Business Logic
Strict 3-field authentication: Email + Username + Password
All must match the SAME database record.
"""

import logging
from django.utils import timezone  # type: ignore
from django.conf import settings  # type: ignore
from rest_framework_simplejwt.tokens import RefreshToken  # type: ignore
from core.token import MyTokenObtainPairSerializer  # type: ignore
from . import database

logger = logging.getLogger('login.flow')

# ============================================================================
# CONFIGURATION
# ============================================================================

MAX_FAILED_ATTEMPTS = 5          # Lock after this many failures
LOCKOUT_DURATION_MINUTES = 5     # Lockout duration in minutes

# SECURE_MODE: When True, all auth failures return generic "Invalid credentials"
# Reads from settings, falls back to NOT DEBUG (secure in production)
def _is_secure_mode():
    return getattr(settings, 'SECURE_LOGIN_MODE', not settings.DEBUG)


# ============================================================================
# RATE LIMITING HELPERS
# ============================================================================

def _check_rate_limit(email, ip_address):
    """
    Check if this email is rate-limited.
    Returns (is_blocked, message) tuple.
    """
    attempt_count, locked_until = database.get_failed_attempt_count(email)

    if locked_until and locked_until > timezone.now():
        remaining = int((locked_until - timezone.now()).total_seconds() / 60) + 1
        logger.warning(
            f"🔒 RATE LIMIT HIT | Email: {email} | IP: {ip_address} | "
            f"Locked until: {locked_until}"
        )
        return True, f"Too many failed attempts. Try again in {remaining} minute(s)."

    return False, None


def _record_failed_attempt(email, ip_address, reason):
    """
    Record a failed login attempt.
    Logs internally, never exposes internal reason to user.
    """
    database.record_failed_attempt(email, ip_address)

    # Internal log only - NOT exposed to user
    logger.warning(
        f"❌ LOGIN FAILED | Email: {email} | IP: {ip_address} | "
        f"Reason: {reason} | Time: {timezone.localtime().strftime('%Y-%m-%d %H:%M:%S')}"
    )


def _reset_failed_attempts(email):
    """Reset failed attempt counter on successful login."""
    database.reset_failed_attempts(email)


# ============================================================================
# STRICT 3-FIELD AUTHENTICATION
# ============================================================================

def authenticate_user(email, username, password, ip_address='unknown'):
    """
    Strict 3-field authentication: Branch Email + Username + Password.
    ALL THREE must match the same database record.
    """
    identifier_for_logs = f"{email}:{username}"

    # ── Guard: All three fields are mandatory ────────────────────────────────
    if not email or not username or not password:
        missing = []
        if not email:    missing.append('email')
        if not username: missing.append('username')
        if not password: missing.append('password')
        return None, {
            'field': 'general',
            'message': f"Required fields missing: {', '.join(missing)}"
        }

    # ── Step 0: Rate-limit check ─────────────────────────────────────────────
    is_blocked, block_msg = _check_rate_limit(identifier_for_logs, ip_address)
    if is_blocked:
        return None, {'field': 'general', 'message': block_msg, 'rate_limited': True}

    # ── Step 1 & 2: Check Branch Email and Username exist ────────────────────
    user = database.get_user_by_email_and_username(email, username)
    if user is None:
        _record_failed_attempt(identifier_for_logs, ip_address, "Branch email or Username not found")
        return None, {'field': 'username', 'message': 'Invalid Branch Email or Username.'}

    # ── Step 3: Check Password (always hashed) ───────────────────────────────
    if not user.check_password(password):
        _record_failed_attempt(identifier_for_logs, ip_address, "Wrong password")
        return None, {'field': 'password', 'message': 'Password is incorrect.'}

    # ── Step 4: Account active check ────────────────────────────────────────
    if not user.is_active:
        _record_failed_attempt(identifier_for_logs, ip_address, "Account inactive")
        return None, {'field': 'general', 'message': 'Account is inactive. Please contact your administrator.'}

    # ── Step 4.5: Account expiry check ──────────────────────────────────────
    if user.access_expiry and user.access_expiry < timezone.now():
        _record_failed_attempt(identifier_for_logs, ip_address, f"Account expired (expiry: {user.access_expiry})")
        return None, {
            'field': 'general',
            'message': f'Access expired on {user.access_expiry.strftime("%Y-%m-%d")}. Please contact your administrator.'
        }

    # ── Step 5: SUCCESS ──────────────────────────────────────────────────────
    _reset_failed_attempts(identifier_for_logs)

    refresh = MyTokenObtainPairSerializer.get_token(user)
    token_data = {
        'access':        str(refresh.access_token),
        'refresh':       str(refresh),
        'username':      user.username,
        'email':         getattr(user, 'email', ''),
        'tenant_id':     user.branch_id,
        'company_name':  getattr(user, 'company_name', ''),
        'selected_plan': getattr(user, 'selected_plan', 'Free'),
    }

    logger.info(
        f"✅ LOGIN SUCCESS | Branch: {user.branch_id} | User: {user.username} | "
        f"IP: {ip_address} | Time: {timezone.localtime().strftime('%Y-%m-%d %H:%M:%S')}"
    )

    return user, token_data


# ============================================================================
# TOKEN REFRESH
# ============================================================================

def refresh_access_token(refresh_token):
    """
    Refresh access token.

    Returns:
        dict: New tokens or None if failed
    """
    from rest_framework_simplejwt.tokens import RefreshToken as JWT_RefreshToken  # type: ignore

    try:
        refresh = JWT_RefreshToken(refresh_token)
        return {
            'access':  str(refresh.access_token),
            'refresh': str(refresh),  # May be rotated
        }
    except Exception as e:
        logger.error(f"Token refresh failed: {e}")
        return None


# ============================================================================
# FORGOT / RESET FLOWS (unchanged)
# ============================================================================

def forgot_user_id(identifier):
    """Business logic for retrieving User IDs."""
    users = database.get_users_by_identifier(identifier)
    if not users:
        return None, "No account found with this information"

    user_ids = [u.username for u in users]
    masked_ids = [uid[:2] + '*' * (len(uid) - 2) for uid in user_ids]
    return masked_ids, "User ID(s) found"


def reset_password(username, identifier, new_password):
    """Business logic for resetting password."""
    user = database.get_user_by_username_and_identifier(username, identifier)
    if not user:
        return False, "No matching account found with these details"

    from django.contrib.auth.hashers import make_password  # type: ignore
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
    from django.utils import timezone  # type: ignore
    from datetime import timedelta
    from django.contrib.auth.hashers import make_password  # type: ignore
    from django.core.mail import send_mail  # type: ignore
    from django.conf import settings  # type: ignore

    user = database.get_user_by_email(email)

    if not user:
        return False, "This email address is not registered."

    otp = f"{random.randint(100000, 999999)}"
    otp_hash = make_password(otp)
    expires_at = timezone.now() + timedelta(minutes=5)

    database.create_otp(user, otp_hash, expires_at)

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

    return True, "A verification code has been sent to your email."


def verify_reset_otp(email, otp, new_password):
    """
    Verify OTP and reset password.
    Returns: (success_bool, message)
    """
    from django.contrib.auth.hashers import check_password, make_password  # type: ignore
    from django.utils import timezone  # type: ignore

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

    user.password = make_password(new_password)
    user.save()
    database.mark_otp_used(otp_record)

    logger.info(f"Password reset successful for {email}")
    return True, "Your password has been successfully reset."


def verify_otp_only(email, otp):
    """
    Verify OTP without resetting password.
    Returns: (success_bool, message)
    """
    from django.contrib.auth.hashers import check_password  # type: ignore

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
