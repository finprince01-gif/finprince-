import os
import sys
import django

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from inventory.models import InventoryStockItem, StockMovement, InventoryOperationNewGRN

print(f"Total Stock Items: {InventoryStockItem.objects.count()}")
for item in InventoryStockItem.objects.all():
    print(f"Item: {item.item_code}, Balance: {item.current_balance}, Tenant: {item.tenant_id}")

print(f"\nTotal Stock Movements: {StockMovement.objects.count()}")
for move in StockMovement.objects.all():
    print(f"Move: {move.voucher_no}, Qty: {move.inward_qty}, Item: {move.item_code}")

print(f"\nTotal GRNs: {InventoryOperationNewGRN.objects.count()}")
for grn in InventoryOperationNewGRN.objects.all():
    print(f"GRN: {grn.grn_no}, Tenant: {grn.tenant_id}")
