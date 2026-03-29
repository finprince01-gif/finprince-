from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def filter_tables():
    with connection.cursor() as cursor:
        cursor.execute("SHOW TABLES")
        tables = [row[0] for row in cursor.fetchall()]
        print("Filtered Tables:")
        for t in tables:
            if 'journal' in t or 'entry' in t or 'entries' in t:
                print(f"- {t}")

if __name__ == "__main__":
    filter_tables()
