import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with open('inspect_eway_py.txt', 'w') as f:
    with connection.cursor() as cursor:
        cursor.execute("DESCRIBE voucher_sales_ewaybill;")
        rows = cursor.fetchall()
        f.write("\nEway Bill Columns:\n")
        f.write(str([row[0] for row in rows]) + "\n")
        for row in rows:
            f.write(f"{row[0]}: {row[1]}\n")
