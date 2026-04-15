import os
import django
import json
import logging

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
# We need to find where the settings are. Based on previous runs, it might be backend.settings.base or just backend.settings
# Let's try to detect it or use a common one. 
# Looking at previous error: ModuleNotFoundError: No module named 'backend.settings.base'; 'backend.settings' is not a package
# This suggests 'backend' might be a directory and 'settings.py' inside it, or 'backend/settings/' is a package.

try:
    django.setup()
except Exception as e:
    print(f"Initial setup failed: {e}")
    # Try alternative
    os.environ['DJANGO_SETTINGS_MODULE'] = 'settings' # if running from backend dir
    try:
        django.setup()
    except Exception as e2:
        print(f"Second setup failed: {e2}")

from django.db import connection
from vendors.vendorproduct_database import VendorProductServiceDatabase

def test_upsert_and_get():
    tenant_id = 'test_tenant_123'
    vendor_id = 1 # Assuming vendor with ID 1 exists, or we use a high ID for testing
    items = [
        {
            'hsn_sac_code': '9983',
            'item_code': 'IT-001',
            'item_name': 'Test Software Service',
            'supplier_item_code': 'S-IT-001',
            'supplier_item_name': 'Supplier Test Software'
        }
    ]
    
    print(f"Attempting to upsert for vendor_id={vendor_id}...")
    try:
        # We need a real vendor_id that exists in vendor_master_vendorcreation_basicdetail
        # Let's find one first
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM vendor_master_vendorcreation_basicdetail LIMIT 1")
            row = cursor.fetchone()
            if not row:
                print("No vendors found in vendor_master_vendorcreation_basicdetail. Cannot test.")
                return
            vendor_id = row[0]
            print(f"Using existing vendor_id={vendor_id}")

        result = VendorProductServiceDatabase.upsert_product_services(
            tenant_id=tenant_id,
            vendor_basic_detail_id=vendor_id,
            items=items,
            created_by='test_user'
        )
        print("Upsert successful!")
        print(f"Result: {json.dumps(result, indent=2)}")
        
        # Verify
        fetched = VendorProductServiceDatabase.get_by_vendor(vendor_id)
        if fetched and len(fetched['items']) == 1:
            if fetched['items'][0]['item_name'] == 'Test Software Service':
                print("Verification successful: Item name matches!")
            else:
                print(f"Verification failed: Item name mismatch. Got {fetched['items'][0]['item_name']}")
        else:
            print(f"Verification failed: Could not fetch record or items empty. Fetched: {fetched}")

    except Exception as e:
        print(f"Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_upsert_and_get()
