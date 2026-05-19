import sys
import os
import django
from django.db import connection

# Ensure the project root is in the python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def list_migrations():
    with connection.cursor() as cursor:
        cursor.execute("SELECT app, name, applied FROM django_migrations")
        migrations = cursor.fetchall()
        print("Applied Migrations:")
        for m in migrations:
            print(f"- {m[0]}: {m[1]} ({m[2]})")

if __name__ == "__main__":
    list_migrations()
