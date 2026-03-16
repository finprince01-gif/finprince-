import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def check_and_fix_nulls():
    with connection.cursor() as cursor:
        # Find a placeholder ledger ID
        cursor.execute("SELECT id FROM master_ledgers LIMIT 1")
        row = cursor.fetchone()
        if not row:
            print("No ledgers found in master_ledgers. Cannot fix NULLs.")
            return
        placeholder_id = row[0]
        print(f"Using ledger ID {placeholder_id} as placeholder for existing NULLs.")

        # Fix Receipt
        cursor.execute(f"UPDATE voucher_receipt_single SET receive_in_ledger_id = {placeholder_id} WHERE receive_in_ledger_id IS NULL")
        cursor.execute(f"UPDATE voucher_receipt_single SET receive_from_ledger_id = {placeholder_id} WHERE receive_from_ledger_id IS NULL")
        
        # Fix Payment
        cursor.execute(f"UPDATE voucher_payment_single SET pay_from_ledger_id = {placeholder_id} WHERE pay_from_ledger_id IS NULL")
        cursor.execute(f"UPDATE voucher_payment_single SET pay_to_ledger_id = {placeholder_id} WHERE pay_to_ledger_id IS NULL")
        
        print("Updated existing NULL values to placeholder ledger.")

        print("Proceeding with ALTER TABLE...")
        try:
            # MySQL syntax for MODIFY
            cursor.execute("ALTER TABLE voucher_receipt_single MODIFY receive_in_ledger_id BIGINT NOT NULL")
            cursor.execute("ALTER TABLE voucher_receipt_single MODIFY receive_from_ledger_id BIGINT NOT NULL")
            cursor.execute("ALTER TABLE voucher_payment_single MODIFY pay_from_ledger_id BIGINT NOT NULL")
            cursor.execute("ALTER TABLE voucher_payment_single MODIFY pay_to_ledger_id BIGINT NOT NULL")
            print("Successfully updated database constraints.")
        except Exception as e:
            print(f"Error applying constraints: {e}")

if __name__ == "__main__":
    check_and_fix_nulls()
