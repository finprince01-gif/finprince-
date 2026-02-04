
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

tables = [
    'inventory_stock_groups',
    'inventory_units',
    'inventory_operation_jobwork',
    'inventory_operation_locationchange',
    'inventory_operation_interunit',
    'inventory_operation_scrap',
    'stock_movements'
]

with connection.cursor() as cursor:
    with open('inventory_extended_schemas.txt', 'w', encoding='utf-8') as f:
        for table in tables:
            try:
                cursor.execute(f"SHOW CREATE TABLE {table}")
                row = cursor.fetchone()
                f.write(f"--- {table} ---\n")
                f.write(row[1] + "\n\n")
            except Exception as e:
                f.write(f"--- {table} ---\nERROR: {e}\n\n")
