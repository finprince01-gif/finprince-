import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

with connection.cursor() as cursor:
    try:
        cursor.execute("ALTER TABLE transactions ADD COLUMN ref_no VARCHAR(150) NULL;")
        print("Added ref_no to transactions.")
    except Exception as e:
        print(f"Error adding to transactions: {e}")

    try:
        cursor.execute("ALTER TABLE bank_statement_temp ADD COLUMN ref_no VARCHAR(150) NULL;")
        print("Added ref_no to bank_statement_temp.")
    except Exception as e:
        print(f"Error adding to bank_statement_temp: {e}")
