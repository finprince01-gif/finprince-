
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def inspect():
    with connection.cursor() as cursor:
        print("--- vendor_master_banking ---")
        cursor.execute("DESCRIBE vendor_master_banking")
        for row in cursor.fetchall():
            print(row)

        print("\n--- vendor_master_basicdetail ---")
        cursor.execute("DESCRIBE vendor_master_basicdetail")
        for row in cursor.fetchall():
            print(row)
            
if __name__ == '__main__':
    inspect()
