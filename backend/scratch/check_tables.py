import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection
cursor = connection.cursor()

# List all tables in DB
cursor.execute("SHOW TABLES")
all_tables = [r[0] for r in cursor.fetchall()]
print("=== ALL TABLES ===")
for t in sorted(all_tables):
    print(t)

# Check columns of session finalization table
session_tables = [t for t in all_tables if 'session' in t.lower() or 'finali' in t.lower()]
print("\n=== SESSION/FINALIZATION TABLES ===")
for t in session_tables:
    print(f"\n-- {t} --")
    cursor.execute(f"DESCRIBE `{t}`")
    for col in cursor.fetchall():
        print(col)

# Check for export_tasks table
print("\n=== EXPORT/POISON TABLES ===")
for t in [t for t in all_tables if 'export' in t.lower() or 'poison' in t.lower()]:
    print(f"EXISTS: {t}")
