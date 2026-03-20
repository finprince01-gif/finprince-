import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def check_columns():
    with connection.cursor() as cursor:
        cursor.execute("DESCRIBE voucher_sales_invoicedetails")
        columns = cursor.fetchall()
        print("Columns in voucher_sales_invoicedetails:")
        for col in columns:
            print(f" - {col[0]}: {col[1]}")

if __name__ == "__main__":
    check_columns()
