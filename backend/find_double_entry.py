from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def find_double_entry_table():
    with connection.cursor() as cursor:
        cursor.execute("SHOW TABLES")
        tables = [row[0] for row in cursor.fetchall()]
        print("Finding tables with 'debit' and 'credit' columns:")
        for t in tables:
            try:
                cursor.execute(f"DESCRIBE {t}")
                cols = [row[0].lower() for row in cursor.fetchall()]
                if 'debit' in cols and 'credit' in cols:
                    print(f"- {t}")
            except:
                pass

if __name__ == "__main__":
    find_double_entry_table()
