import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

tables = ['advance_allocation', 'pending_transaction', 'transaction_allocations']

with connection.cursor() as cursor:
    for table in tables:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN ref_no VARCHAR(150) NULL;")
            print(f"Added ref_no to {table}.")
        except Exception as e:
            print(f"Error adding to {table}: {e}")
