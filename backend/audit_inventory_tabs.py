
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

tables = [
    'inventory_master_grn',
    'inventory_master_issueslip',
    'inventory_master_category',
    'inventory_operation_interunit'
]

print("=== Inventory Tabs Audit ===")
with connection.cursor() as cursor:
    for t in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {t}")
            count = cursor.fetchone()[0]
            print(f"{t}: {count}")
        except Exception as e:
            print(f"{t}: [MISSING/ERROR] {e}")
