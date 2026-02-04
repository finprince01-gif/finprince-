
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

tables = [
    'vendor_master_category',
    'vendor_master_terms',  # Assuming this is related to PO Settings or Terms
    'vendor_master_basicdetail',
    'vendor_master_gstdetails',
    'vendor_master_productservices',
    'vendor_master_tds',
    'vendor_master_banking',
    'vendor_transaction_po'
]

print("=== Vendor Portal Audit ===")
with connection.cursor() as cursor:
    for t in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {t}")
            count = cursor.fetchone()[0]
            print(f"{t}: {count}")
        except Exception as e:
            print(f"{t}: [MISSING/ERROR] {e}")
