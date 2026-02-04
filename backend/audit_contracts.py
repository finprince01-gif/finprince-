
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def audit_contracts():
    print("=== Customer Portal Contracts Audit ===")
    
    tables = [
        'customer_master_longtermcontracts_basicdetails',
        'customer_master_longtermcontracts_productservices',
        'customer_master_longtermcontracts_termscondition'
    ]
    
    with connection.cursor() as cursor:
        cursor.execute("SHOW TABLES")
        existing_tables = [row[0] for row in cursor.fetchall()]
        
        for table in tables:
            if table in existing_tables:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                print(f"[EXISTS] {table}: {count} rows")
            else:
                print(f"[MISSING] {table}")

if __name__ == '__main__':
    audit_contracts()
