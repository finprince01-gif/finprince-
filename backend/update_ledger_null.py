import os, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

sql_commands = """
ALTER TABLE entries MODIFY COLUMN ledger_id BIGINT NULL COMMENT 'FK to master_ledgers';
"""

with connection.cursor() as cursor:
    for cmd in sql_commands.strip().split(';'):
        if cmd.strip():
            print(f"Executing: {cmd.strip()}")
            try:
                cursor.execute(cmd.strip())
                print("Success.")
            except Exception as e:
                print(f"Error: {e}")
