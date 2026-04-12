import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def get_db_tables():
    cursor = connection.cursor()
    cursor.execute("SHOW TABLES")
    return [t[0] for t in cursor.fetchall()]

def final_schema_fix():
    cursor = connection.cursor()
    tables = get_db_tables()
    
    # 1. Ensure Table norm_debit_note_supply_headers exists
    if 'norm_debit_note_supply_headers' not in tables:
        print("Creating Table norm_debit_note_supply_headers...")
        cursor.execute("""
            CREATE TABLE `norm_debit_note_supply_headers` (
                `id` bigint NOT NULL AUTO_INCREMENT,
                `tenant_id` varchar(36) DEFAULT NULL,
                `created_at` datetime(6) DEFAULT NULL,
                `updated_at` datetime(6) DEFAULT NULL,
                `debit_note_details_id` bigint NOT NULL,
                `total_taxable_value` decimal(15,2) DEFAULT '0.00',
                `total_igst` decimal(15,2) DEFAULT '0.00',
                `total_cgst` decimal(15,2) DEFAULT '0.00',
                `total_sgst` decimal(15,2) DEFAULT '0.00',
                `total_cess` decimal(15,2) DEFAULT '0.00',
                `total_invoice_value` decimal(15,2) DEFAULT '0.00',
                PRIMARY KEY (`id`),
                UNIQUE KEY `debit_note_details_id` (`debit_note_details_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """)

    # 2. Add missing columns found in audit
    def add_col(table, col, definition):
        cursor.execute(f"SHOW COLUMNS FROM `{table}` LIKE '{col}'")
        if not cursor.fetchone():
            print(f"Adding missing column {col} to {table}...")
            cursor.execute(f"ALTER TABLE `{table}` ADD COLUMN `{col}` {definition}")

    # PaymentVoucherItem (if missed)
    add_col('payment_voucher_items', 'reference_number', 'VARCHAR(100) NULL')
    add_col('payment_voucher_items', 'pending_amount', 'DECIMAL(15, 2) DEFAULT 0')
    add_col('payment_voucher_items', 'balance_after', 'DECIMAL(15, 2) DEFAULT 0')
    add_col('payment_voucher_items', 'invoice_date', 'DATE NULL')
    add_col('payment_voucher_items', 'ledger_id_val', 'BIGINT NULL')
    add_col('payment_voucher_items', 'party_customer_id', 'BIGINT NULL')
    add_col('payment_voucher_items', 'party_vendor_id', 'BIGINT NULL')
    add_col('payment_voucher_items', 'tenant_id', 'VARCHAR(36) NULL')

    # ReceiptVoucherItem
    add_col('receipt_voucher_items', 'invoice_date', 'DATE NULL')
    add_col('receipt_voucher_items', 'ledger_id_val', 'BIGINT NULL')
    add_col('receipt_voucher_items', 'party_customer_id', 'BIGINT NULL')
    add_col('receipt_voucher_items', 'party_vendor_id', 'BIGINT NULL')

    # VoucherAllocation
    add_col('voucher_allocations', 'target_voucher_no', 'VARCHAR(100) NULL')
    add_col('voucher_allocations', 'target_voucher_date', 'DATE NULL')
    add_col('voucher_allocations', 'source_voucher_no', 'VARCHAR(100) NULL')
    add_col('voucher_allocations', 'source_voucher_date', 'DATE NULL')
    add_col('voucher_allocations', 'pending_amount', 'DECIMAL(15, 2) DEFAULT 0')
    add_col('voucher_allocations', 'balance_after', 'DECIMAL(15, 2) DEFAULT 0')
    add_col('voucher_allocations', 'reference_type', "VARCHAR(50) DEFAULT 'INVOICE'")
    add_col('voucher_allocations', 'party_customer_id', 'BIGINT NULL')
    add_col('voucher_allocations', 'party_vendor_id', 'BIGINT NULL')

    # Inventory fields
    if 'inventory_master_grn' in tables:
        add_col('inventory_master_grn', 'start_from', 'INT NULL')
    if 'inventory_master_issueslip' in tables:
        add_col('inventory_master_issueslip', 'start_from', 'INT NULL')
    if 'inventory_operation_scrap' in tables:
        add_col('inventory_operation_scrap', 'issue_slip_series', 'VARCHAR(100) NULL')

if __name__ == "__main__":
    final_schema_fix()
    print("Final schema fix applied.")
