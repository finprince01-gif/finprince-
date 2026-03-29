from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def describe_payment_voucher_items():
    with connection.cursor() as cursor:
        cursor.execute("DESCRIBE payment_voucher_items")
        rows = cursor.fetchall()
        print("Schema for payment_voucher_items:")
        for row in rows:
            print(f"- {row[0]}")

if __name__ == "__main__":
    describe_payment_voucher_items()
