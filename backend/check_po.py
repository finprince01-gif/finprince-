
import os
import sys
import django
from django.db import connection

# Setup Django
sys.path.append(r'd:\testing\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with connection.cursor() as cursor:
    cursor.execute("SELECT id, name, is_active, tenant_id FROM vendor_master_posettings")
    rows = cursor.fetchall()
    print(f"Total rows: {len(rows)}")
    for row in rows:
        print(row)
