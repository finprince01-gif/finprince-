
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with connection.cursor() as cursor:
    cursor.execute("DESCRIBE accounting_voucher")
    cols = cursor.fetchall()
    print("Columns in accounting_voucher:")
    for c in cols:
        print(c[0])
