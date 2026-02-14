
import os
import django
import sys

# Set up Django environment
sys.path.append(r'c:\108\muthu\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def check_banking_db():
    with connection.cursor() as cursor:
        print("--- Table Structure ---")
        cursor.execute("DESCRIBE vendor_master_banking")
        for row in cursor.fetchall():
            print(f"Field: {row[0]}, Type: {row[1]}, Null: {row[2]}, Key: {row[3]}, Default: {row[4]}, Extra: {row[5]}")
        
        print("\n--- Recent Records ---")
        cursor.execute("SELECT * FROM vendor_master_banking ORDER BY id DESC LIMIT 5")
        columns = [col[0] for col in cursor.description]
        for row in cursor.fetchall():
            print(dict(zip(columns, row)))

if __name__ == "__main__":
    check_banking_db()
