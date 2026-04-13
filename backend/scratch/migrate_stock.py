import os
import sys
import django
import json
from decimal import Decimal

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from inventory.models import InventoryOperationNewGRN, InventoryOperationNewGRNItem, InventoryLocation
from inventory.views import record_stock_movement

def migrate_grns():
    grns = InventoryOperationNewGRN.objects.all()
    print(f"Migrating {grns.count()} GRNs...")
    
    for grn in grns:
        items = InventoryOperationNewGRNItem.objects.filter(parent=grn)
        location_name = ""
        if grn.location_id:
            try:
                loc = InventoryLocation.objects.get(id=grn.location_id)
                location_name = loc.name
            except: pass
            
        for item in items:
            qty = item.accepted_qty or item.received_qty or item.quantity or 0
            if qty > 0:
                print(f"Recording movement for {item.item_code} from GRN {grn.grn_no}")
                record_stock_movement(
                    tenant_id=grn.tenant_id,
                    item_code=item.item_code,
                    item_name=item.item_name,
                    voucher_type="GRN (Migrated)",
                    voucher_no=grn.grn_no or "N/A",
                    quantity=qty,
                    rate=item.rate or 0,
                    location_name=location_name,
                    is_inward=True
                )

if __name__ == "__main__":
    migrate_grns()
    print("Migration complete.")
