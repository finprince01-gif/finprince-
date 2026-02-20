import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with open('db_info_types.txt', 'w') as f:
    def check_table(table_name):
        f.write(f"\n--- {table_name} ---\n")
        with connection.cursor() as cursor:
            cursor.execute(f"DESCRIBE {table_name}")
            rows = cursor.fetchall()
            for row in rows:
                f.write(f"{row[0]}: {row[1]}\n")

    for t in ['voucher_payment_single', 'voucher_receipt_single', 'voucher_payment_bulk', 'voucher_receipt_bulk']:
        check_table(t)
