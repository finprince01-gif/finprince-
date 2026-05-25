import os
import sys
import django

# Setup Django
sys.path.append(r"d:\ledger_report0.37\AI-accounting-0.03\backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from inventory.models import InventoryItem

try:
    items = InventoryItem.objects.all()
    print(f"Total inventory items in DB: {items.count()}")
    for i in items:
        print(f"ID: {i.id}, Code: {i.item_code}, Name: {i.item_name}, HSN: {i.hsn_code}, UOM: {i.uom}")
except Exception as e:
    import traceback
    traceback.print_exc()
