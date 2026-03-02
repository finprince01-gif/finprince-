"""
Test the complete API flow: serializer + database, exactly as the frontend sends data
with item names that are FREE TEXT (not from inventory dropdown).
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterBasicDetail, VendorMasterProductService
from vendors.vendorproduct_serializers import VendorProductServiceCreateSerializer
from vendors.vendorproduct_database import VendorProductServiceDatabase

vendor = VendorMasterBasicDetail.objects.order_by('-id').first()
print(f"Vendor: {vendor.vendor_name} (ID: {vendor.id}, tenant: {vendor.tenant_id})")

# Simulate what frontend now sends - free-text itemName
payload = [
    {
        "vendor_basic_detail": vendor.id,
        "hsn_sac_code": "1001",
        "item_code": "CUSTOM-001",
        "item_name": "Custom Free Text Item",   # NOT from inventory dropdown
        "supplier_item_code": "S001",
        "supplier_item_name": "Supplier Custom",
        "is_active": True
    }
]

print("\n--- Serializer Test ---")
s = VendorProductServiceCreateSerializer(data=payload, many=True)
if s.is_valid():
    print("VALID")
    for vd in s.validated_data:
        print(f"  vbd type={type(vd['vendor_basic_detail']).__name__}, item={vd.get('item_name')}")
    
    print("\n--- DB Test ---")
    for item_data in s.validated_data:
        result = VendorProductServiceDatabase.create_product_service(
            tenant_id=vendor.tenant_id,
            data=item_data,
            created_by='test'
        )
        print(f"  Created ID: {result.id}, item_name: {result.item_name}, vendor_id: {result.vendor_basic_detail_id}")
    print("\nSUCCESS!")
else:
    print(f"INVALID: {s.errors}")
