import os
import django
from django.db import connection
from pymysql.err import OperationalError

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def add_columns():
    with connection.cursor() as cursor:
        try:
            print("Adding posting_status column...")
            cursor.execute("ALTER TABLE voucher_sales_invoicedetails ADD COLUMN posting_status VARCHAR(20) DEFAULT 'success' AFTER status")
            print("Successfully added posting_status.")
        except Exception as e:
            if "Duplicate column" in str(e):
                print("Column posting_status already exists.")
            else:
                print(f"Error adding posting_status: {e}")

        try:
            print("Adding posting_error column...")
            cursor.execute("ALTER TABLE voucher_sales_invoicedetails ADD COLUMN posting_error TEXT DEFAULT NULL AFTER posting_status")
            print("Successfully added posting_error.")
        except Exception as e:
            if "Duplicate column" in str(e):
                print("Column posting_error already exists.")
            else:
                print(f"Error adding posting_error: {e}")

if __name__ == "__main__":
    add_columns()
