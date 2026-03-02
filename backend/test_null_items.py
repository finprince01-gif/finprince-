"""
Test: save vendor product services when items is null/empty — must still create a row.
"""
import os, django, json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection
from vendors.models import VendorMasterBasicDetail
from vendors.vendorproduct_serializers import VendorProductServiceCreateSerializer
from vendors.vendorproduct_database import VendorProductServiceDatabase

# Add DEFAULT to live table (matches schema.sql)
with connection.cursor() as cursor:
    try:
        cursor.execute("""
            ALTER TABLE vendor_master_vendorcreation_productservices
            MODIFY COLUMN items JSON NOT NULL DEFAULT (JSON_ARRAY())
        """)
        print("ALTER TABLE: items column now has DEFAULT (JSON_ARRAY())")
    except Exception as e:
        print(f"ALTER TABLE skipped (may already be set): {e}")

vendor = VendorMasterBasicDetail.objects.order_by('-id').first()
print(f"\nVendor: {vendor.vendor_name} (ID: {vendor.id})")

# ── Test 1: empty items [] ────────────────────────────────────────────────────
print("\n--- Test 1: items = [] (empty, no products added) ---")
payload_empty = {
    "vendor_basic_detail": vendor.id,
    "items": [],          # user left the Products tab blank
    "is_active": True
}
s = VendorProductServiceCreateSerializer(data=payload_empty)
assert s.is_valid(), f"Serializer error: {s.errors}"
r = VendorProductServiceDatabase.upsert_product_services(
    tenant_id=vendor.tenant_id,
    vendor_basic_detail_id=s.validated_data['vendor_basic_detail'],
    items=s.validated_data['items'],
    created_by='test'
)
print(f"Saved record ID: {r['id']}, items: {r['items']}")

# ── Test 2: items not sent at all (None / missing key) ───────────────────────
print("\n--- Test 2: items key missing entirely ---")
payload_no_key = {
    "vendor_basic_detail": vendor.id,
    # no 'items' key at all
    "is_active": True
}
s2 = VendorProductServiceCreateSerializer(data=payload_no_key)
assert s2.is_valid(), f"Serializer error: {s2.errors}"
items2 = s2.validated_data['items']
print(f"Validated items (should be []): {items2}")
r2 = VendorProductServiceDatabase.upsert_product_services(
    tenant_id=vendor.tenant_id,
    vendor_basic_detail_id=s2.validated_data['vendor_basic_detail'],
    items=items2,
    created_by='test'
)
print(f"Saved record ID: {r2['id']}, items: {r2['items']}")

# ── Test 3: items with valid entries ─────────────────────────────────────────
print("\n--- Test 3: items with 2 products ---")
payload_full = {
    "vendor_basic_detail": vendor.id,
    "items": [
        {"item_name": "Office Chair", "item_code": "OC-01"},
        {"item_name": "Desk Lamp", "item_code": "DL-01"},
    ],
    "is_active": True
}
s3 = VendorProductServiceCreateSerializer(data=payload_full)
assert s3.is_valid(), f"Serializer error: {s3.errors}"
r3 = VendorProductServiceDatabase.upsert_product_services(
    tenant_id=vendor.tenant_id,
    vendor_basic_detail_id=s3.validated_data['vendor_basic_detail'],
    items=s3.validated_data['items'],
    created_by='test'
)
print(f"Saved record ID: {r3['id']}, items count: {len(r3['items'])}")
print(f"Items: {json.dumps(r3['items'], indent=2)}")

print("\nAll 3 tests passed.")
