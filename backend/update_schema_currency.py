import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def add_column(cursor, table, column, definition):
    try:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        print(f"✅ Column {column} added to {table}")
    except Exception as e:
        if "Duplicate column name" in str(e) or "already exists" in str(e):
            print(f"ℹ️ Column {column} already exists in {table}")
        else:
            print(f"❌ Error adding {column} to {table}: {e}")

with connection.cursor() as cursor:
    table_name = "customer_master_customer_basicdetails"
    
    print(f"Applying additional schema changes to {table_name}...")
    
    add_column(cursor, table_name, "billing_currency", "VARCHAR(10) NULL")
    
    print("Schema update completed.")
