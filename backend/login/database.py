"""
Login Database Layer - Pure Data Access
NO business logic, NO RBAC, NO tenant validation.
Only database queries.
"""

import logging
from django.contrib.auth import get_user_model

User = get_user_model()
logger = logging.getLogger('login.database')


# ============================================================================
# USER QUERIES
# ============================================================================

def get_user_by_username(username):
    """Get user by username."""
    try:
        return User.objects.filter(username=username)
    except Exception as e:
        logger.error(f"Error fetching user by username: {e}")
        return None

def get_user_by_email(email):
    """Get user by email."""
    try:
        return User.objects.get(email=email)
    except User.DoesNotExist:
        return None
    except Exception as e:
        logger.error(f"Error fetching user by email: {e}")
        return None
