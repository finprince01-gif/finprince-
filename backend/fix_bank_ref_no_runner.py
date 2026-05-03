import os
import sys
import django

# Setup Django
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    # Check if column exists
    cursor.execute(
        "SELECT COUNT(*) FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() "
        "AND TABLE_NAME = 'bank_statement_temp' "
        "AND COLUMN_NAME = 'ref_no'"
    )
    exists = cursor.fetchone()[0]

    if exists:
        print("INFO: ref_no column ALREADY EXISTS in bank_statement_temp — no action needed.")
    else:
        cursor.execute(
            "ALTER TABLE bank_statement_temp "
            "ADD COLUMN ref_no VARCHAR(150) NULL DEFAULT NULL"
        )
        print("SUCCESS: ref_no column added to bank_statement_temp")

    # Also verify allocation tables
    for table in ['advance_allocation', 'pending_transaction', 'transaction_allocations']:
        cursor.execute(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() "
            "AND TABLE_NAME = %s "
            "AND COLUMN_NAME = 'ref_no'",
            [table]
        )
        ex = cursor.fetchone()[0]
        if ex:
            print(f"  OK: {table}.ref_no exists")
        else:
            cursor.execute(
                f"ALTER TABLE {table} ADD COLUMN ref_no VARCHAR(150) NULL DEFAULT NULL"
            )
            print(f"  FIXED: ref_no added to {table}")
