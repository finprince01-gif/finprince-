import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def get_fields():
    with connection.cursor() as cursor:
        for table in ['voucher_receipt_single', 'voucher_payment_single']:
            cursor.execute(f"DESCRIBE {table}")
            print(f"--- {table} ---")
            for row in cursor.fetchall():
                print(row[0])
            print("\n")

if __name__ == "__main__":
    get_fields()
