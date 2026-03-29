import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_create_sql():
    with connection.cursor() as cursor:
        cursor.execute("SHOW CREATE TABLE receipt_vouchers")
        print(cursor.fetchone()[1])
            
if __name__ == "__main__":
    check_create_sql()
