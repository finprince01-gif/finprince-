import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("SELECT * FROM master_hierarchy_raw WHERE `Ledgers` LIKE '%Purchase Account%'")
    print("Hierarchy Raw:", cursor.fetchall())
    
    cursor.execute("SELECT `id`, `ledger_type`, `ledger_code` FROM master_ledgers WHERE `ledger_type` LIKE '%Purchase Account%'")
    print("Master Ledgers:", cursor.fetchall())
