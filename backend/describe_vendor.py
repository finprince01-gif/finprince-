
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with connection.cursor() as cursor:
    cursor.execute("DESCRIBE vendor_master_basicdetail")
    cols = cursor.fetchall()
    with open('vendor_desc.txt', 'w', encoding='utf-8') as f:
        for c in cols:
            f.write(f"{c[0]} {c[1]}\n")
