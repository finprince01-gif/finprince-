from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def list_all_v3():
    with connection.cursor() as cursor:
        cursor.execute("SHOW DATABASES")
        dbs = [row[0] for row in cursor.fetchall()]
        print("Detailed Search for Entries/Journals:")
        for db in dbs:
            try:
                cursor.execute(f"SELECT table_name FROM information_schema.tables WHERE table_schema = '{db}' AND (table_name LIKE '%entry%' OR table_name LIKE '%entries%' OR table_name LIKE '%journal%')")
                rows = cursor.fetchall()
                for row in rows:
                    print(f"- {db}.{row[0]}")
            except:
                pass

if __name__ == "__main__":
    list_all_v3()
