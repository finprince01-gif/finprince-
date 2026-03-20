import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_vouchers_structure():
    with connection.cursor() as cursor:
        cursor.execute("SELECT table_type FROM information_schema.tables WHERE table_name = 'vouchers'")
        res = cursor.fetchone()
        print(f"vouchers is a: {res[0] if res else 'NOT FOUND'}")
        
        if res and res[0] == 'VIEW':
            cursor.execute("SELECT view_definition FROM information_schema.views WHERE table_name = 'vouchers'")
            view_def = cursor.fetchone()
            print(f"View definition: {view_def[0]}")

if __name__ == "__main__":
    check_vouchers_structure()
