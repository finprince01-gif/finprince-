import os
import sys
import django

# Setup Django
sys.path.append(r"d:\ledger_report0.37\AI-accounting-0.03\backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounting.models import MasterLedger
from inventory.models import StockItem

try:
    print("Ledgers:")
    for l in MasterLedger.objects.all():
        print(f"  - ID: {l.id}, Name: {l.name}, Group: {l.group}")
        
    print("\nStock Items:")
    for s in StockItem.objects.all():
        print(f"  - ID: {s.id}, Name: {s.name}, Code: {s.item_code}, HSN: {s.hsn_code}, UOM: {s.uom}")
except Exception as e:
    import traceback
    traceback.print_exc()
