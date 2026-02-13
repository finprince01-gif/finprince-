"""
Database Migration Script: Remove customer_uom column
This script removes the customer_uom column from customer_master_customer_productservice table
"""
import os
import sys
import django
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent / 'backend'
sys.path.insert(0, str(backend_dir))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def remove_customer_uom_column():
    """Remove customer_uom column from customer_master_customer_productservice table"""
    
    with connection.cursor() as cursor:
        print("🔍 Checking if customer_uom column exists...")
        
        # Check if column exists
        cursor.execute("""
            SELECT COUNT(*) 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = %s 
            AND TABLE_NAME = 'customer_master_customer_productservice' 
            AND COLUMN_NAME = 'customer_uom'
        """, [connection.settings_dict['NAME']])
        
        column_exists = cursor.fetchone()[0] > 0
        
        if column_exists:
            print("✅ Column 'customer_uom' found. Removing it...")
            
            # Drop the column
            cursor.execute("""
                ALTER TABLE `customer_master_customer_productservice` 
                DROP COLUMN `customer_uom`
            """)
            
            print("✅ Successfully removed 'customer_uom' column!")
            
            # Show the updated table structure
            print("\n📋 Updated table structure:")
            cursor.execute("DESCRIBE `customer_master_customer_productservice`")
            columns = cursor.fetchall()
            
            print("\nColumn Name          | Type                | Null | Key | Default | Extra")
            print("-" * 90)
            for col in columns:
                print(f"{col[0]:<20} | {col[1]:<19} | {col[2]:<4} | {col[3]:<3} | {str(col[4]):<7} | {col[5]}")
        else:
            print("ℹ️  Column 'customer_uom' does not exist. No changes needed.")
            
            # Show current table structure
            print("\n📋 Current table structure:")
            cursor.execute("DESCRIBE `customer_master_customer_productservice`")
            columns = cursor.fetchall()
            
            print("\nColumn Name          | Type                | Null | Key | Default | Extra")
            print("-" * 90)
            for col in columns:
                print(f"{col[0]:<20} | {col[1]:<19} | {col[2]:<4} | {col[3]:<3} | {str(col[4]):<7} | {col[5]}")

if __name__ == '__main__':
    try:
        print("=" * 90)
        print("DATABASE MIGRATION: Remove customer_uom column")
        print("=" * 90)
        print(f"Database: {connection.settings_dict['NAME']}")
        print(f"Table: customer_master_customer_productservice")
        print("=" * 90)
        print()
        
        remove_customer_uom_column()
        
        print()
        print("=" * 90)
        print("✅ Migration completed successfully!")
        print("=" * 90)
        
    except Exception as e:
        print()
        print("=" * 90)
        print(f"❌ Error during migration: {str(e)}")
        print("=" * 90)
        sys.exit(1)
