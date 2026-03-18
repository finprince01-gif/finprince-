import os
import django
from django.db import connection

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_categories():
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, tenant_id, category FROM vendor_master_category ORDER BY id;")
        rows = cursor.fetchall()
        print("Existing Categories in vendor_master_category:")
        for row in rows:
            print(f"ID: {row[0]}, Tenant: {row[1]}, Category: {row[2]}")

if __name__ == "__main__":
    check_categories()
