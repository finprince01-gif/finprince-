import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def list_data():
    with connection.cursor() as cursor:
        cursor.execute("SELECT voucher_number, advance_ref_no FROM receipt_vouchers")
        print("\n--- MASTER VOUCHERS ---")
        for row in cursor.fetchall():
            print(f"Voucher: {row[0]}, AdvanceRef: {row[1]}")
            
        cursor.execute("SELECT reference_id FROM receipt_voucher_items")
        print("\n--- ITEM REFERENCES ---")
        for row in cursor.fetchall():
            print(f"ItemRef: {row[0]}")

if __name__ == "__main__":
    list_data()
