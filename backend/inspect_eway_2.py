import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with connection.cursor() as cursor:
    cursor.execute("DESCRIBE voucher_sales_ewaybill;")
    rows = cursor.fetchall()
    print("\nEway Bill Columns:")
    print([row[0] for row in rows])
