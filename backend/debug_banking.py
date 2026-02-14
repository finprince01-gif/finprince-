
import os
import django
import sys

# Set up Django environment
sys.path.append(r'c:\108\muthu\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def check_all_banking():
    with connection.cursor() as cursor:
        print("--- All Banking Records ---")
        cursor.execute("SELECT id, tenant_id, vendor_basic_detail_id, bank_account_no, bank_name, created_at FROM vendor_master_banking ORDER BY id ASC")
        rows = cursor.fetchall()
        for row in rows:
            print(row)
        print(f"\nTotal: {len(rows)}")

if __name__ == "__main__":
    check_all_banking()
