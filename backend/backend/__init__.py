import pymysql

# Use PyMySQL as MySQL driver (alternative to mysqlclient)
pymysql.install_as_MySQLdb()

# Patch version check for Django 6.0 compatibility
pymysql.version_info = (2, 2, 7, "final", 0)
pymysql.__version__ = "2.2.7"

# This ensures the Celery app is loaded when Django starts,
# so @shared_task decorators use the correct app.
from .celery import app as celery_app  # noqa: F401

__all__ = ('celery_app',)
