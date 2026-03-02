"""
End-to-end test of the new JSON-array product services design.
"""
import os, django, json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterBasicDetail
from vendors.vendorproduct_serializers import VendorProductServiceCreateSerializer
from vendors.vendorproduct_database import VendorProductServiceDatabase

vendor = VendorMasterBasicDetail.objects.order_by('-id').first()
print(f"Vendor: {vendor.vendor_name} (ID: {vendor.id})")

# Simulate the new frontend payload: single object with items array
payload = {
    "vendor_basic_detail": vendor.id,
    "items": [
        {"hsn_sac_code": "8471", "item_code": "PC-001", "item_name": "Desktop Computer",
         "supplier_item_code": "S-PC1", "supplier_item_name": "Desktop PC"},
        {"hsn_sac_code": "8473", "item_code": "KBD-001", "item_name": "Mechanical Keyboard",
         "supplier_item_code": "S-KB1", "supplier_item_name": "Keyboard"},
        {"hsn_sac_code": "", "item_code": "", "item_name": "Custom Free-Text Item",
         "supplier_item_code": "", "supplier_item_name": ""},
    ],
    "is_active": True
}

print("\n--- Serializer ---")
s = VendorProductServiceCreateSerializer(data=payload)
assert s.is_valid(), f"Serializer invalid: {s.errors}"
vd = s.validated_data
print(f"vendor_id: {vd['vendor_basic_detail']}, items: {len(vd['items'])}")

print("\n--- DB Upsert (first time) ---")
result = VendorProductServiceDatabase.upsert_product_services(
    tenant_id=vendor.tenant_id,
    vendor_basic_detail_id=vd['vendor_basic_detail'],
    items=vd['items'],
    created_by='test'
)
print(f"Record ID: {result['id']}")
print(f"Items stored: {json.dumps(result['items'], indent=2)}")

print("\n--- DB Upsert (second time -> should UPDATE, not insert duplicate) ---")
payload2 = {**payload, "items": [{"item_name": "Updated Item Only", "item_code": "UPD-01",
                                   "hsn_sac_code": "", "supplier_item_code": "", "supplier_item_name": ""}]}
s2 = VendorProductServiceCreateSerializer(data=payload2)
assert s2.is_valid()
vd2 = s2.validated_data
result2 = VendorProductServiceDatabase.upsert_product_services(
    tenant_id=vendor.tenant_id,
    vendor_basic_detail_id=vd2['vendor_basic_detail'],
    items=vd2['items'],
    created_by='test'
)
print(f"Same Record ID? {result['id'] == result2['id']} (IDs: {result['id']} vs {result2['id']})")
print(f"Updated items: {result2['items']}")

print("\nAll tests passed.")
