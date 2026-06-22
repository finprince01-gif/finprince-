import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("SELECT `Ledgers`, `Code` FROM master_hierarchy_raw WHERE `Ledgers` IN ('Amortization expense', 'Travelling, Conveyance & Boarding', 'Advertisement expense')")
    print("Hierarchy Raw:", cursor.fetchall())
    
    cursor.execute("SELECT `ledger_type`, `ledger_code` FROM master_ledgers WHERE `ledger_type` IN ('Amortization expense', 'Travelling, Conveyance & Boarding', 'Advertisement expense')")
    print("Master Ledgers:", cursor.fetchall())
