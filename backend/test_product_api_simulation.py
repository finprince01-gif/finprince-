"""
Simulates exactly what the frontend sends to /api/vendors/product-services/
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterBasicDetail, VendorMasterProductService
from vendors.vendorproduct_serializers import VendorProductServiceCreateSerializer
from vendors.vendorproduct_database import VendorProductServiceDatabase

vendor = VendorMasterBasicDetail.objects.order_by('-id').first()
if not vendor:
    print("No vendor found!")
    exit(1)

print(f"Using vendor: {vendor.vendor_name} (ID: {vendor.id})")

frontend_payload = [
    {
        "vendor_basic_detail": vendor.id,
        "hsn_sac_code": "1001",
        "item_code": "ITEM-SIM-01",
        "item_name": "Simulated Product Alpha",
        "supplier_item_code": "SUP-01",
        "supplier_item_name": "Supplier Alpha",
        "is_active": True
    },
    {
        "vendor_basic_detail": vendor.id,
        "hsn_sac_code": "2002",
        "item_code": "ITEM-SIM-02",
        "item_name": "Simulated Product Beta",
        "supplier_item_code": "SUP-02",
        "supplier_item_name": "Supplier Beta",
        "is_active": True
    }
]

print("\n--- Step 1: Serializer Validation ---")
serializer = VendorProductServiceCreateSerializer(data=frontend_payload, many=True)
is_valid = serializer.is_valid()
print(f"Valid: {is_valid}")
if not is_valid:
    print(f"SERIALIZER ERRORS: {serializer.errors}")
    exit(1)

# CRITICAL: Check what validated_data looks like for vendor_basic_detail
for i, vd in enumerate(serializer.validated_data):
    vbd = vd.get('vendor_basic_detail')
    print(f"Item {i}: vendor_basic_detail type={type(vbd).__name__}, value={vbd}")
    if hasattr(vbd, 'id'):
        print(f"  -> It's a MODEL OBJECT with id={vbd.id}")
    else:
        print(f"  -> It's a RAW ID: {vbd}")

print("\n--- Step 2: Database Creation ---")
tenant_id = vendor.tenant_id
created_items = []
for item_data in serializer.validated_data:
    print(f"  Creating: {item_data.get('item_name')}")
    item = VendorProductServiceDatabase.create_product_service(
        tenant_id=tenant_id,
        data=item_data,
        created_by='test_user'
    )
    created_items.append(item)
    print(f"  Created ID: {item.id}")

print(f"\nSUCCESS: Created {len(created_items)} product(s).")
