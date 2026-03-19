import os, sys, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from vendors.vendorpo_database import create_purchase_order
from vendors.models import VendorTransactionPO

try:
    po_id = create_purchase_order(
        tenant_id='1234',
        po_data={'vendor_id': 1, 'vendor_name': 'test'},
        items_data=[{'item_code': 'qwerty', 'item_name': 'test', 'quantity': 1, 'uom': 'kg'}]
    )
    print(po_id)
except Exception as e:
    import traceback
    traceback.print_exc()
