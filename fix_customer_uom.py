import mysql.connector
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('backend/.env')

# Database configuration
db_config = {
    'host': 'localhost',
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME', 'ai_accounting'),
    'port': int(os.getenv('DB_PORT', 3306))
}

print("=" * 80)
print("DATABASE MIGRATION: Remove customer_uom column")
print("=" * 80)
print(f"Database: {db_config['database']}")
print(f"Table: customer_master_customer_productservice")
print("=" * 80)
print()

try:
    # Connect to database
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()
    
    print("✅ Connected to database successfully!")
    print()
    
    # Check if column exists
    print("🔍 Checking if 'customer_uom' column exists...")
    cursor.execute("""
        SELECT COUNT(*) 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = %s 
        AND TABLE_NAME = 'customer_master_customer_productservice' 
        AND COLUMN_NAME = 'customer_uom'
    """, (db_config['database'],))
    
    column_exists = cursor.fetchone()[0] > 0
    
    if column_exists:
        print("✅ Column 'customer_uom' found. Removing it...")
        
        # Drop the column
        cursor.execute("""
            ALTER TABLE `customer_master_customer_productservice` 
            DROP COLUMN `customer_uom`
        """)
        conn.commit()
        
        print("✅ Successfully removed 'customer_uom' column!")
    else:
        print("ℹ️  Column 'customer_uom' does not exist. No changes needed.")
    
    print()
    print("📋 Current table structure:")
    cursor.execute("DESCRIBE `customer_master_customer_productservice`")
    columns = cursor.fetchall()
    
    print()
    print(f"{'Field':<30} {'Type':<20} {'Null':<6} {'Key':<6} {'Default':<10}")
    print("-" * 80)
    for col in columns:
        field, type_, null, key, default, extra = col
        print(f"{field:<30} {type_:<20} {null:<6} {key:<6} {str(default):<10}")
    
    cursor.close()
    conn.close()
    
    print()
    print("=" * 80)
    print("✅ Migration completed successfully!")
    print("=" * 80)
    
except mysql.connector.Error as e:
    print()
    print("=" * 80)
    print(f"❌ Database Error: {e}")
    print("=" * 80)
except Exception as e:
    print()
    print("=" * 80)
    print(f"❌ Error: {e}")
    print("=" * 80)
