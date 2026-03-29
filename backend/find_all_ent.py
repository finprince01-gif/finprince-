from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def list_all_tables_everywhere():
    with connection.cursor() as cursor:
        cursor.execute("SHOW DATABASES")
        dbs = [row[0] for row in cursor.fetchall()]
        print("Listing ALL tables across all reachable databases:")
        for db in dbs:
            try:
                cursor.execute(f"SHOW TABLES IN {db}")
                tables = [row[0] for row in cursor.fetchall()]
                for t in tables:
                    if 'ent' in t.lower() or 'journal' in t.lower():
                         print(f"- {db}.{t}")
            except:
                pass

if __name__ == "__main__":
    list_all_tables_everywhere()
