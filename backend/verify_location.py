
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with connection.cursor() as cursor:
    cursor.execute("SELECT COUNT(*) FROM inventory_master_location")
    print(f"Location Count: {cursor.fetchone()[0]}")
