from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def list_all_dbs_tables():
    with connection.cursor() as cursor:
        cursor.execute("SHOW DATABASES")
        dbs = [row[0] for row in cursor.fetchall()]
        print("Finding 'entries' across all databases:")
        for db in dbs:
            try:
                cursor.execute(f"SELECT table_name FROM information_schema.tables WHERE table_schema = '{db}' AND table_name = 'entries'")
                row = cursor.fetchone()
                if row:
                    print(f"- Found in DB: {db}")
            except:
                pass

if __name__ == "__main__":
    list_all_dbs_tables()
