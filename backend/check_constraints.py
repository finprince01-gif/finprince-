import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_constraints():
    tables = [
        'inventory_operation_outward',
        'voucher_sales_invoicedetails'
    ]
    with open('constraints_check.txt', 'w') as f:
        with connection.cursor() as cursor:
            for table in tables:
                f.write(f"\n--- CONSTRAINTS IN {table} ---\n")
                cursor.execute(f"""
                    SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                    FROM information_schema.KEY_COLUMN_USAGE
                    WHERE TABLE_NAME = '{table}' AND TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
                """)
                constraints = cursor.fetchall()
                for c in constraints:
                    f.write(f"{c[0]}: {c[1]} -> {c[2]}.{c[3]}\n")

if __name__ == "__main__":
    check_constraints()
