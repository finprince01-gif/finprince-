
import os
import django
import sys

# Set up Django environment
sys.path.append(r'c:\108\muthu\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def check_banking_table():
    with connection.cursor() as cursor:
        try:
            print("Checking vendor_master_banking table...")
            cursor.execute("DESCRIBE vendor_master_banking")
            rows = cursor.fetchall()
            for row in rows:
                print(row)
            
            print("\nChecking for any data in vendor_master_banking...")
            cursor.execute("SELECT COUNT(*) FROM vendor_master_banking")
            count = cursor.fetchone()[0]
            print(f"Total records: {count}")
            
            if count > 0:
                print("\nShowing last 5 records:")
                cursor.execute("SELECT id, tenant_id, vendor_basic_detail_id, bank_account_no, bank_name FROM vendor_master_banking ORDER BY id DESC LIMIT 5")
                for row in cursor.fetchall():
                    print(row)
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    check_banking_table()
