
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    try:
        cursor.execute("ALTER TABLE receipt_vouchers ADD COLUMN amount DECIMAL(15,2) DEFAULT 0.00 NOT NULL")
        print("Column 'amount' added successfully to 'receipt_vouchers'.")
    except Exception as e:
        print(f"Error adding column: {e}")
