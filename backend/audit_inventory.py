
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

tables = [
    'inventory_stock_groups',
    'inventory_units',
    'inventory_stock_items',
    'inventory_master_grn',
    'inventory_master_issueslip',
    'inventory_operation_production',
    'inventory_operation_consumption',
    'inventory_operation_grn',
    'inventory_operation_new_grn',
    'inventory_operation_outward',
    'inventory_operation_interunit',
    'inventory_operation_jobwork',
    'inventory_operation_locationchange',
    'inventory_operation_scrap',
    'stock_movements'
]

print("=== Inventory Table Audit ===")
with connection.cursor() as cursor:
    for t in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {t}")
            count = cursor.fetchone()[0]
            print(f"{t}: {count}")
        except Exception as e:
            print(f"{t}: [MISSING/ERROR]")
