import os
import sys

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from django.db import connection

try:
    with connection.cursor() as cursor:
        cursor.execute("SHOW COLUMNS FROM vendor_master_basicdetail LIKE 'billing_currency';")
        res = cursor.fetchone()
        if res:
            print("Column billing_currency already exists.")
        else:
            cursor.execute("ALTER TABLE vendor_master_basicdetail ADD COLUMN billing_currency VARCHAR(10) DEFAULT NULL;")
            print("Successfully added billing_currency column.")
except Exception as e:
    print(f"Error: {e}")
