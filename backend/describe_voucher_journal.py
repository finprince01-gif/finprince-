from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def describe_table(table_name):
    with connection.cursor() as cursor:
        cursor.execute(f"DESCRIBE {table_name}")
        columns = cursor.fetchall()
        print(f"Schema for {table_name}:")
        for col in columns:
            print(f"- {col[0]} ({col[1]})")

if __name__ == "__main__":
    describe_table("voucher_journal")
