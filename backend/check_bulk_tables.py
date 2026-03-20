import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def check_columns(table_name):
    with connection.cursor() as cursor:
        try:
            cursor.execute(f"DESCRIBE {table_name}")
            columns = cursor.fetchall()
            print(f"Columns in {table_name}:")
            for col in columns:
                print(f" - {col[0]}: {col[1]}")
        except Exception as e:
            print(f"Error checking table {table_name}: {e}")

if __name__ == "__main__":
    check_columns('bulk_invoice_jobs')
    check_columns('invoice_processing_items')
