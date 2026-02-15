
import os
import django
import sys

# Set up Django environment
sys.path.append(r'c:\108\muthu\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def show_create_table():
    with connection.cursor() as cursor:
        print("--- SHOW CREATE TABLE vendor_master_banking ---")
        cursor.execute("SHOW CREATE TABLE vendor_master_banking")
        row = cursor.fetchone()
        print(row[1])

if __name__ == "__main__":
    show_create_table()
