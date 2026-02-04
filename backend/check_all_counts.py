
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

groups = {
    "Sales": [
        "customer_transaction_salesorder_basicdetails",
        "customer_sales_quotation",
        "customer_transaction"
    ],
    "Purchase": [
        "vendor_transaction_po",
        "inventory_operation_grn" # Already checked but good for context
    ],
    "Payroll": [
        "payroll_employee",
        "payroll_pay_run"
    ],

    "Accounting": [
        "accounting_voucher",
        "accounting_ledger",
        "journal_entries"
    ],
    "Masters": [
        "customer_master_customer_basicdetails",
        "vendor_master_basicdetail",
        "vendor_master_terms"
    ]
}

def check_counts():
    print("=== Database State ===")
    with connection.cursor() as cursor:
        for group, tables in groups.items():
            print(f"\n[{group}]")
            for t in tables:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {t}")
                    count = cursor.fetchone()[0]
                    print(f"  {t}: {count}")
                except Exception as e:
                    # Table might not exist or be named differently
                    print(f"  {t}: [MISSING/ERROR]")

if __name__ == '__main__':
    check_counts()
