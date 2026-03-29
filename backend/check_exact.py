from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_exact_table(table_name):
    with connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = %s", [table_name])
        row = cursor.fetchone()
        if row:
            print(f"Table '{table_name}' EXISTS.")
        else:
            print(f"Table '{table_name}' NOT FOUND.")

if __name__ == "__main__":
    check_exact_table("entries")
    check_exact_table("voucher")
    check_exact_table("vouchers")
