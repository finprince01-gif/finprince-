import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_tables():
    tables_to_check = ['payment_vouchers', 'payment_voucher_items']
    with connection.cursor() as cursor:
        for table in tables_to_check:
            cursor.execute(f"SHOW TABLES LIKE '{table}'")
            exists = cursor.fetchone()
            if exists:
                print(f"Table '{table}' exists.")
                cursor.execute(f"DESCRIBE {table}")
                columns = cursor.fetchall()
                for col in columns:
                    print(f"  Column: {col[0]}, Type: {col[1]}")
            else:
                print(f"Table '{table}' does NOT exist.")

if __name__ == "__main__":
    check_tables()
