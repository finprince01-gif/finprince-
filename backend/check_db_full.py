
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

tables = ["receipt_vouchers", "entries", "vouchers"]
with connection.cursor() as cursor:
    for table in tables:
        print(f"\n--- {table} ---")
        cursor.execute(f"DESCRIBE {table}")
        columns = cursor.fetchall()
        for col in columns:
            print(col)
