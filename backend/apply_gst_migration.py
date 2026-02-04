"""
Script to add GST fields to sales_vouchers table
Executes ALTER TABLE commands via Django's database connection
"""
import os
import sys
import django

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def run_migrations():
    """Execute ALTER TABLE commands to add GST fields"""
    
    migrations = [
        "ALTER TABLE sales_vouchers ADD COLUMN place_of_supply VARCHAR(2) NULL;",
        "ALTER TABLE sales_vouchers ADD COLUMN reverse_charge VARCHAR(1) DEFAULT 'N';",
        "ALTER TABLE sales_vouchers ADD COLUMN invoice_type VARCHAR(50) DEFAULT 'Regular';",
        "ALTER TABLE sales_vouchers ADD COLUMN export_type VARCHAR(10) NULL;",
        "ALTER TABLE sales_vouchers ADD COLUMN port_code VARCHAR(6) NULL;",
        "ALTER TABLE sales_vouchers ADD COLUMN shipping_bill_number VARCHAR(50) NULL;",
        "ALTER TABLE sales_vouchers ADD COLUMN shipping_bill_date DATE NULL;",
        "ALTER TABLE sales_vouchers ADD COLUMN ecommerce_gstin VARCHAR(15) NULL;",
    ]
    
    with connection.cursor() as cursor:
        print("Starting GST fields migration...")
        
        for i, sql in enumerate(migrations, 1):
            try:
                cursor.execute(sql)
                field_name = sql.split('ADD COLUMN ')[1].split(' ')[0]
                print(f"✓ [{i}/8] Added column: {field_name}")
            except Exception as e:
                error_msg = str(e)
                if 'Duplicate column name' in error_msg or 'already exists' in error_msg:
                    field_name = sql.split('ADD COLUMN ')[1].split(' ')[0]
                    print(f"✓ [{i}/8] Column already exists: {field_name}")
                else:
                    print(f"✗ [{i}/8] Error: {error_msg}")
                    raise
        
        print("\n" + "="*50)
        print("Verifying new columns...")
        print("="*50 + "\n")
        
        # Verify columns were added
        cursor.execute("""
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'sales_vouchers'
              AND COLUMN_NAME IN (
                'place_of_supply', 'reverse_charge', 'invoice_type', 'export_type',
                'port_code', 'shipping_bill_number', 'shipping_bill_date', 'ecommerce_gstin'
              )
            ORDER BY COLUMN_NAME;
        """)
        
        results = cursor.fetchall()
        
        if results:
            print(f"{'Column Name':<25} {'Type':<15} {'Max Length':<12} {'Default'}")
            print("-" * 75)
            for row in results:
                col_name, data_type, max_length, default = row
                max_len_str = str(max_length) if max_length else 'N/A'
                default_str = str(default) if default else 'NULL'
                print(f"{col_name:<25} {data_type:<15} {max_len_str:<12} {default_str}")
            
            print(f"\n✓ Migration completed successfully! {len(results)}/8 columns verified.")
        else:
            print("⚠ Warning: No columns found. Verification failed.")
    
    connection.close()

if __name__ == '__main__':
    try:
        run_migrations()
    except Exception as e:
        print(f"\n✗ Migration failed: {e}")
        sys.exit(1)
