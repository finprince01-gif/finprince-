"""
Database Module - Database Connection & Utilities
Centralized database configuration and helper functions.
"""

from django.db import connection


def check_db_connection():
    """
    Check if database connection is working.
    
    Returns:
        tuple: (is_connected: bool, error_message: str or None)
    """
    try:
        connection.ensure_connection()
        return True, None
    except Exception as e:
        return False, str(e)


def get_db_connection():
    """
    Get the current database connection.
    
    Returns:
        Database connection object
    """
    return connection


# Additional database utilities can be added here as needed
# For now, Django ORM handles most database operations
