import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_columns():
    with connection.cursor() as cursor:
        cursor.execute("SHOW COLUMNS FROM voucher_sales_invoicedetails")
        columns = cursor.fetchall()
        print("Columns in voucher_sales_invoicedetails:")
        for col in columns:
            print(f"{col[0]} ({col[1]})")

if __name__ == "__main__":
    check_columns()
