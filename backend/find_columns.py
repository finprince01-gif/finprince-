from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def find_columns(col1, col2):
    with connection.cursor() as cursor:
        cursor.execute("SHOW TABLES")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"Finding tables with columns {col1} and {col2}:")
        for t in tables:
            try:
                cursor.execute(f"DESCRIBE {t}")
                cols = [row[0].lower() for row in cursor.fetchall()]
                if col1.lower() in cols and col2.lower() in cols:
                    print(f"- {t}")
            except:
                pass

if __name__ == "__main__":
    find_columns("ledger_id", "voucher_id")
