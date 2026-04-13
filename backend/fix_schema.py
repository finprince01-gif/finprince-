import os
import sys
import django
from django.db import connection

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def run_sql(sql, ignore_duplicate=True):
    with connection.cursor() as cursor:
        try:
            print(f"Executing: {sql[:100]}...")
            cursor.execute(sql)
            print("Done.")
        except Exception as e:
            # Error 1060: Duplicate column name
            if ignore_duplicate and hasattr(e, 'args') and e.args[0] == 1060:
                print("Column already exists, skipping.")
            else:
                print(f"Error: {e}")

def fix_master_hierarchy_raw():
    print("\n--- Fixing master_hierarchy_raw ---")
    
    # Add id column - if it fails it might already have it or be tricky
    run_sql("ALTER TABLE master_hierarchy_raw ADD COLUMN id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST")
    
    # Add snake_case columns
    columns_to_add = [
        ("type_of_business_1", "TEXT"),
        ("financial_reporting_1", "TEXT"),
        ("major_group_1", "TEXT"),
        ("group_1", "TEXT"),
        ("sub_group_1_1", "TEXT"),
        ("sub_group_2_1", "TEXT"),
        ("sub_group_3_1", "TEXT"),
        ("ledger_1", "TEXT"),
        ("code", "TEXT"),
        ("major_group_2", "TEXT"),
        ("sub_group_3_2", "TEXT"),
        ("type_of_business_2", "TEXT"),
        ("sub_group_2_2", "TEXT"),
        ("financial_reporting_2", "TEXT"),
        ("sub_group_1_2", "TEXT"),
        ("ledger_2", "TEXT"),
    ]
    
    for col_name, col_type in columns_to_add:
        run_sql(f"ALTER TABLE master_hierarchy_raw ADD COLUMN `{col_name}` {col_type}")

    # Sync data from old spaced columns to new snake_case columns
    mapping = {
        "type_of_business_1": "Type of Business",
        "financial_reporting_1": "Financial Reporting",
        "major_group_1": "Major Group",
        "group_1": "Group",
        "sub_group_1_1": "Sub-group 1",
        "sub_group_2_1": "Sub-group 2",
        "sub_group_3_1": "Sub-group 3",
        "ledger_1": "Ledgers",
        "code": "Code"
    }
    
    for new_col, old_col in mapping.items():
        run_sql(f"UPDATE master_hierarchy_raw SET `{new_col}` = `{old_col}`")

def fix_vendor_master_product_service():
    print("\n--- Fixing vendors_vendormasterproductservice ---")
    
    run_sql("ALTER TABLE vendors_vendormasterproductservice ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1")
    run_sql("ALTER TABLE vendors_vendormasterproductservice ADD COLUMN created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6)")
    run_sql("ALTER TABLE vendors_vendormasterproductservice ADD COLUMN updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)")
    run_sql("ALTER TABLE vendors_vendormasterproductservice ADD COLUMN created_by VARCHAR(100) DEFAULT NULL")
    run_sql("ALTER TABLE vendors_vendormasterproductservice ADD COLUMN updated_by VARCHAR(100) DEFAULT NULL")

def fix_vendor_transaction():
    print("\n--- Fixing vendor_transaction ---")
    
    run_sql("ALTER TABLE vendor_transaction ADD COLUMN debit DECIMAL(15, 2) NOT NULL DEFAULT 0.00")
    run_sql("ALTER TABLE vendor_transaction ADD COLUMN credit DECIMAL(15, 2) NOT NULL DEFAULT 0.00")

def fix_allocation_tables():
    print("\n--- Fixing Allocation Tables (transaction_allocations, advance_allocation, pending_transaction) ---")
    tables = ['transaction_allocations', 'advance_allocation', 'pending_transaction']
    columns = [
        ("pay_from_ledger_id_val", "BIGINT DEFAULT NULL"),
        ("pay_from_customer_id_val", "BIGINT DEFAULT NULL"),
        ("pay_from_vendor_id_val", "BIGINT DEFAULT NULL"),
        ("pay_to_ledger_id_val", "BIGINT DEFAULT NULL"),
        ("pay_to_customer_id_val", "BIGINT DEFAULT NULL"),
        ("pay_to_vendor_id_val", "BIGINT DEFAULT NULL"),
        ("receive_from_ledger_id_val", "BIGINT DEFAULT NULL"),
        ("receive_from_customer_id_val", "BIGINT DEFAULT NULL"),
        ("receive_from_vendor_id_val", "BIGINT DEFAULT NULL"),
        ("receive_in_ledger_id_val", "BIGINT DEFAULT NULL"),
        ("receive_in_customer_id_val", "BIGINT DEFAULT NULL"),
        ("receive_in_vendor_id_val", "BIGINT DEFAULT NULL"),
        ("ledger_id_val", "BIGINT DEFAULT NULL"),
        ("party_customer_id", "BIGINT DEFAULT NULL"),
        ("party_vendor_id", "BIGINT DEFAULT NULL"),
        
        # Metadata
        ("details_party_name", "VARCHAR(255) DEFAULT NULL"),
        ("details_date", "DATE DEFAULT NULL"),
        ("details_amount", "DECIMAL(15, 2) DEFAULT 0.00"),
        ("details_status", "VARCHAR(50) DEFAULT NULL"),
        
        # Extra columns that might be missing in some
        ("is_advance", "TINYINT(1) DEFAULT 0"),
        ("advance_ref_no", "VARCHAR(150) DEFAULT NULL"),
        ("invoice_date", "DATE DEFAULT NULL"),
        ("pending_before", "DECIMAL(15, 2) DEFAULT 0.00"),
        ("balance_after", "DECIMAL(15, 2) DEFAULT 0.00"),
    ]
    
    for table in tables:
        print(f"\nFixing table: {table}")
        for col_name, col_type in columns:
            run_sql(f"ALTER TABLE {table} ADD COLUMN `{col_name}` {col_type}")

if __name__ == "__main__":
    fix_master_hierarchy_raw()
    fix_vendor_master_product_service()
    fix_vendor_transaction()
    fix_allocation_tables()
    print("\nSchema Fix Complete.")
