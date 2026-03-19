import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.db import connection

def deep_cleanup():
    with connection.cursor() as cursor:
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        tables = [
            'voucher_receipt_single', 'voucher_receipt_bulk', 'vouchers', 'journal_entries',
            'voucher_sales_invoicedetails', 'voucher_sales_paymentdetails',
            'voucher_sales_items', 'voucher_sales_items_foreign',
            'voucher_sales_ewaybill', 'voucher_sales_dispatchdetails'
        ]
        for t in tables:
            try:
                cursor.execute(f"DELETE FROM {t}")
                print(f"Cleared table: {t}")
            except Exception as e:
                print(f"Error on {t}: {e}")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
    print("Cleanup complete.")

if __name__ == '__main__':
    deep_cleanup()
