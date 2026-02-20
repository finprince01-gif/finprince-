import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with connection.cursor() as cursor:
    try:
        cursor.execute("ALTER TABLE voucher_payment_single ADD COLUMN advance_ref_no VARCHAR(100) NULL")
        print("Column advance_ref_no added")
    except Exception as e:
        print(f"Error adding advance_ref_no: {e}")

    try:
        cursor.execute("ALTER TABLE voucher_payment_single ADD COLUMN advance_amount DECIMAL(15,2) DEFAULT 0")
        print("Column advance_amount added")
    except Exception as e:
        print(f"Error adding advance_amount: {e}")
