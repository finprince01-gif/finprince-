
import os
import django
import sys

# Set up Django environment
sys.path.append(r'c:\108\muthu\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def list_vendor_tables():
    with connection.cursor() as cursor:
        cursor.execute("SHOW TABLES LIKE 'vendor_%'")
        for row in cursor.fetchall():
            print(row[0])

if __name__ == "__main__":
    list_vendor_tables()
