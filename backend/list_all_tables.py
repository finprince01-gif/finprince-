from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def list_all_finpixe():
    with connection.cursor() as cursor:
        cursor.execute("SHOW TABLES")
        rows = cursor.fetchall()
        print("All Tables in finpixe_ai_accounting:")
        for row in rows:
            print(f"- {row[0]}")

if __name__ == "__main__":
    list_all_finpixe()
