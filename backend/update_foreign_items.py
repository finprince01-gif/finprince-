import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def add_columns():
    cols_to_add = [
        ("voucher_sales_items_foreign", "alternate_unit", "VARCHAR(50)"),
        ("voucher_sales_items_foreign", "sales_ledger", "VARCHAR(255)"),
    ]
    
    with connection.cursor() as cursor:
        for table, col, col_type in cols_to_add:
            try:
                # Check if column exists
                cursor.execute(f"SHOW COLUMNS FROM {table} LIKE '{col}'")
                if not cursor.fetchone():
                    print(f"Adding {col} to {table}...")
                    cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type} NULL")
                else:
                    print(f"Column {col} already exists in {table}")
            except Exception as e:
                print(f"Error adding {col} to {table}: {e}")

if __name__ == "__main__":
    add_columns()
