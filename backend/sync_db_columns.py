import os
import django
from django.db import connection
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def sync_missing_columns():
    cursor = connection.cursor()
    
    # helper to add column if not exists
    def add_col(table, col, definition):
        cursor.execute(f"SHOW COLUMNS FROM `{table}` LIKE '{col}'")
        if not cursor.fetchone():
            print(f"Adding column {col} to {table}...")
            cursor.execute(f"ALTER TABLE `{table}` ADD COLUMN `{col}` {definition}")
        else:
            print(f"Column {col} already exists in {table}.")

    # PaymentVoucherItem
    add_col('payment_voucher_items', 'reference_number', 'VARCHAR(100) NULL')
    add_col('payment_voucher_items', 'pending_amount', 'DECIMAL(15, 2) DEFAULT 0')
    add_col('payment_voucher_items', 'balance_after', 'DECIMAL(15, 2) DEFAULT 0')
    add_col('payment_voucher_items', 'invoice_date', 'DATE NULL')
    
    # ReceiptVoucherItem
    add_col('receipt_voucher_items', 'invoice_date', 'DATE NULL')
    
    # VoucherAllocation
    add_col('voucher_allocations', 'target_voucher_no', 'VARCHAR(100) NULL')
    add_col('voucher_allocations', 'target_voucher_date', 'DATE NULL')
    add_col('voucher_allocations', 'source_voucher_no', 'VARCHAR(100) NULL')
    add_col('voucher_allocations', 'source_voucher_date', 'DATE NULL')
    add_col('voucher_allocations', 'pending_amount', 'DECIMAL(15, 2) DEFAULT 0')
    add_col('voucher_allocations', 'balance_after', 'DECIMAL(15, 2) DEFAULT 0')
    add_col('voucher_allocations', 'reference_type', "VARCHAR(50) DEFAULT 'INVOICE'")

    # Extra check for tables that were allegedly faked
    # vendors_vendormasterproductservice (table rename from vendors.0006)
    cursor.execute("SHOW TABLES LIKE 'vendors_vendormasterproductservice'")
    if not cursor.fetchone():
        cursor.execute("SHOW TABLES LIKE 'vendor_master_vendorcreation_productservices'")
        if cursor.fetchone():
            print("Renaming vendor_master_vendorcreation_productservices to vendors_vendormasterproductservice...")
            cursor.execute("RENAME TABLE `vendor_master_vendorcreation_productservices` TO `vendors_vendormasterproductservice`")

    # TransactionFile (typo)
    cursor.execute("SHOW TABLES LIKE 'Transcaction_file'")
    if cursor.fetchone():
        print("Fixing typo: Renaming Transcaction_file to transaction_file...")
        cursor.execute("RENAME TABLE `Transcaction_file` TO `transaction_file`")

if __name__ == "__main__":
    sync_missing_columns()
    print("Schema sync complete.")
