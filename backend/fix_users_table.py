import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

db_config = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'database': os.getenv('DB_NAME', 'Ai_accounting')
}

try:
    connection = pymysql.connect(**db_config)
    cursor = connection.cursor()
    
    print("Checking users table schema...")
    
    # Check if users table exists
    cursor.execute("SHOW TABLES LIKE 'users'")
    table_exists = cursor.fetchone()
    
    if table_exists:
        print("✓ Users table exists")
        
        # Check current schema
        cursor.execute("DESCRIBE users")
        columns = cursor.fetchall()
        
        has_updated_at = False
        for col in columns:
            if col[0] == 'updated_at':
                has_updated_at = True
                print(f"\nCurrent updated_at column:")
                print(f"  Type: {col[1]}")
                print(f"  Null: {col[2]}")
                print(f"  Default: {col[4]}")
                print(f"  Extra: {col[5]}")
        
        if has_updated_at:
            print("\n🔧 Fixing updated_at column...")
            cursor.execute("""
                ALTER TABLE users 
                MODIFY COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            """)
            connection.commit()
            print("✅ updated_at column fixed!")
            
            # Verify the fix
            cursor.execute("DESCRIBE users")
            columns = cursor.fetchall()
            for col in columns:
                if col[0] == 'updated_at':
                    print(f"\nVerified updated_at column:")
                    print(f"  Type: {col[1]}")
                    print(f"  Null: {col[2]}")
                    print(f"  Default: {col[4]}")
                    print(f"  Extra: {col[5]}")
        else:
            print("\n⚠ updated_at column doesn't exist - will be created by migrations")
    else:
        print("⚠ Users table doesn't exist yet")
        print("Run 'python manage.py migrate' to create it")
    
except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    if 'connection' in locals():
        connection.close()
