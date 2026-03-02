import os
import django
import sys

# Add backend to path
sys.path.append(r'c:\108\muthu\AI-accounting-0.03\backend')

# Set settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Initialize django
django.setup()

from vendors.vendorproduct_database import VendorProductServiceDatabase
from vendors.models import VendorMasterBasicDetail

def test_database_call():
    try:
        # Get a vendor
        vendor = VendorMasterBasicDetail.objects.first()
        if not vendor:
            print("No vendor found to link to")
            return
        
        print(f"Linking to vendor: {vendor.vendor_name} (ID: {vendor.id})")
        
        # This mirrors what DRF passes: Model instance in 'vendor_basic_detail' key
        data = {
            'vendor_basic_detail': vendor,
            'hsn_sac_code': 'HSN001',
            'item_code': 'ITEM001',
            'item_name': 'Database Call Item',
            'supplier_item_code': 'SUPITEM001',
            'supplier_item_name': 'Supplier Item'
        }
        
        product = VendorProductServiceDatabase.create_product_service(
            tenant_id=vendor.tenant_id,
            data=data,
            created_by="antigravity"
        )
        print(f"Successfully created product via database class, ID: {product.id}")
        
    except Exception as e:
        print(f"Error during database call: {e}")

if __name__ == "__main__":
    test_database_call()
