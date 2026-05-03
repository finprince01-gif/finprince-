import os, sys, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.db import connection

with connection.cursor() as c:
    # Widen status to fit 'duplicate' (9 chars)
    c.execute(
        "ALTER TABLE bank_statement_temp "
        "MODIFY COLUMN status VARCHAR(12) NOT NULL DEFAULT 'draft'"
    )
    print("SUCCESS: bank_statement_temp.status widened to VARCHAR(12)")

    # Verify
    c.execute(
        "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() "
        "AND TABLE_NAME = 'bank_statement_temp' "
        "AND COLUMN_NAME = 'status'"
    )
    row = c.fetchone()
    print(f"Column type is now: {row[0] if row else 'unknown'}")
