import os
import django
import sys

# Add backend to path
sys.path.append(r'c:\108\muthu\AI-accounting-0.03\backend')

# Set settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Initialize django
django.setup()

from vendors.models import VendorMasterProductService, VendorMasterBasicDetail

def test_insert():
    try:
        # Get a vendor
        vendor = VendorMasterBasicDetail.objects.first()
        if not vendor:
            print("No vendor found to link to")
            return
        
        print(f"Linking to vendor: {vendor.vendor_name} (ID: {vendor.id})")
        
        # Try to create a product service
        product = VendorMasterProductService.objects.create(
            tenant_id=vendor.tenant_id,
            vendor_basic_detail=vendor,
            item_name="Antigravity Test Item 2",
            item_code="AG-TEST-002",
            is_active=True,
            created_by="antigravity",
            updated_by="antigravity"
        )
        print(f"Successfully created product service with ID: {product.id}")
        
        # Verify it exists in DB
        exists = VendorMasterProductService.objects.filter(id=product.id).exists()
        print(f"Verification in DB: {exists}")
        
    except Exception as e:
        print(f"Error during insert: {e}")

if __name__ == "__main__":
    test_insert()
