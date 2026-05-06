import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection
with connection.cursor() as cursor:
    cursor.execute('SHOW CREATE TABLE invoice_ocr_temp')
    print(cursor.fetchone()[1])
