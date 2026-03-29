from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_db():
    with connection.cursor() as cursor:
        cursor.execute("SELECT DATABASE()")
        db = cursor.fetchone()[0]
        print(f"Current Database: {db}")

if __name__ == "__main__":
    check_db()
