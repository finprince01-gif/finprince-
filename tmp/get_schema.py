import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def get_constraints():
    with connection.cursor() as cursor:
        for table in ['voucher_receipt_single', 'voucher_payment_single']:
            cursor.execute(f"SHOW CREATE TABLE {table}")
            print(f"--- {table} ---")
            print(cursor.fetchone()[1])
            print("\n")

if __name__ == "__main__":
    get_constraints()
