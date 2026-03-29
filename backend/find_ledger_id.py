from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def find_ledger_id_tables():
    with connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'ledger_id'")
        rows = cursor.fetchall()
        print("Tables with 'ledger_id' column:")
        for row in rows:
            print(f"- {row[0]}")

if __name__ == "__main__":
    find_ledger_id_tables()
