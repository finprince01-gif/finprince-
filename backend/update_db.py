import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

query = "ALTER TABLE voucher_contra ADD COLUMN voucher_series varchar(100) DEFAULT NULL AFTER voucher_number;"

with connection.cursor() as cursor:
    try:
        cursor.execute(query)
        print("Success: column added!")
    except Exception as e:
        print("Error:", e)
