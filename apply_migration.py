import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

try:
    import mysql.connector
    from dotenv import load_dotenv
    
    # Load environment variables
    env_path = os.path.join(os.path.dirname(__file__), 'backend', '.env')
    load_dotenv(env_path)
    
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
    
    # Connect to database
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()
    
    print("Connected to database successfully!")
    print()
    
    # Check if column exists
    print("Checking if 'customer_uom' column exists...")
    cursor.execute("""
        SELECT COUNT(*) 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = %s 
        AND TABLE_NAME = 'customer_master_customer_productservice' 
        AND COLUMN_NAME = 'customer_uom'
    """, (db_config['database'],))
    
    column_exists = cursor.fetchone()[0] > 0
    
    if column_exists:
        print("Column 'customer_uom' found. Removing it...")
        
        # Drop the column
        cursor.execute("""
            ALTER TABLE `customer_master_customer_productservice` 
            DROP COLUMN `customer_uom`
        """)
        conn.commit()
        
        print("SUCCESS: Removed 'customer_uom' column!")
    else:
        print("INFO: Column 'customer_uom' does not exist. No changes needed.")
    
    print()
    print("Current table structure:")
    cursor.execute("DESCRIBE `customer_master_customer_productservice`")
    columns = cursor.fetchall()
    
    print()
    for col in columns:
        print(f"  - {col[0]} ({col[1]})")
    
    cursor.close()
    conn.close()
    
    print()
    print("=" * 80)
    print("Migration completed successfully!")
    print("=" * 80)
    
except ImportError as e:
    print(f"ERROR: Missing required package - {e}")
    print("Please install: pip install mysql-connector-python python-dotenv")
    sys.exit(1)
except mysql.connector.Error as e:
    print(f"DATABASE ERROR: {e}")
    sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
