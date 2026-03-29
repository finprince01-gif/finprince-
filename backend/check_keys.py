import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_keys():
    with connection.cursor() as cursor:
        cursor.execute("SHOW KEYS FROM receipt_vouchers WHERE Non_unique = 0")
        print("--- UNIQUE KEYS (receipt_vouchers) ---")
        for row in cursor.fetchall():
            print(f"Index: {row[2]}, Column: {row[4]}")
            
if __name__ == "__main__":
    check_keys()
