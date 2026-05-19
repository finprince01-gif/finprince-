import os
import django
from django.db import connection

import sys
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def add_column(table, column, definition):
    with connection.cursor() as cursor:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition};")
            print(f"[OK] Added {column} to {table}.")
        except Exception as e:
            if "Duplicate column name" in str(e) or "1060" in str(e):
                print(f"[SKIP] {column} already exists in {table}.")
            else:
                print(f"[ERR] Error adding {column} to {table}: {e}")

table_name = "session_finalization_states"

# Required forensic columns
columns = [
    ("expected_pages", "INT DEFAULT 0"),
    ("completed_pages", "INT DEFAULT 0"),
    ("failed_pages", "INT DEFAULT 0"),
    ("ai_completed_pages", "INT DEFAULT 0"),
    ("total_pages_expected", "INT DEFAULT 0"), # Legacy
    ("total_pages_completed", "INT DEFAULT 0"), # Legacy
]

print(f"Synchronizing schema for {table_name}...")
for col, defn in columns:
    add_column(table_name, col, defn)

print("Schema synchronization complete.")
