import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_child_sql():
    with connection.cursor() as cursor:
        cursor.execute("SHOW CREATE TABLE receipt_voucher_items")
        print(cursor.fetchone()[1])
            
if __name__ == "__main__":
    check_child_sql()
