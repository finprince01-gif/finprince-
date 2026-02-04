
import os
import django
import sys

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection



def check_tables():
    expected = [
        'customer_master_customer_basicdetails',
        'customer_master_customer_gstdetails',
        'customer_master_customer_banking',
        'customer_master_customer_productservice',
        'customer_master_customer_termscondition',
        'customer_master_customer_tds',
        'customer_master_category'
    ]
    

def check_tables():
    with connection.cursor() as cursor:
        cursor.execute("SHOW TABLES LIKE 'customer%'")
        tables = [row[0] for row in cursor.fetchall()]
        
        print(f"FOUND TABLES ({len(tables)}):")
        for t in tables:
            print(f"'{t}'")

if __name__ == '__main__':
    check_tables()
