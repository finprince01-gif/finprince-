
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with connection.cursor() as cursor:
    # Check column names first to be safe
    cursor.execute("DESCRIBE inventory_stock_items")
    cols = [col[0] for col in cursor.fetchall()]
    print(f"Columns: {cols}")
    
    if 'item_code' in cols:
        cursor.execute("SELECT item_code FROM inventory_stock_items LIMIT 5")
        rows = cursor.fetchall()
        print(f"Items: {[r[0] for r in rows]}")
    else:
        print("item_code column not found")
