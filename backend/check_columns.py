import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.db import connection

table_name = 'customer_master_longtermcontracts_productservices'
print(f"Checking {table_name} NOT NULL columns:")
with connection.cursor() as c:
    c.execute(f"DESCRIBE {table_name}")
    rows = c.fetchall()
    for r in rows:
        col_name, col_type, nullable, key, default, extra = r
        print(f"  {col_name:<30}  NULL={nullable}  default={default}")
