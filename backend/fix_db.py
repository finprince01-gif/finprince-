import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def add_col(table, col_name, col_type):
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type};")
            print(f"Added {col_name} to {table}")
    except Exception as e:
        print(f"Failed to add {col_name}: {e}")

def run_updates():
    with connection.cursor() as cursor:
        add_col("users", "state", "VARCHAR(100) NULL")
        add_col("users", "selected_plan", "VARCHAR(50) NULL")
        add_col("users", "logo_path", "VARCHAR(500) NULL")
        add_col("users", "tenant_id", "CHAR(36) NULL")
        add_col("users", "phone", "VARCHAR(15) NULL")
        add_col("users", "phone_verified", "TINYINT(1) DEFAULT 0")
        add_col("users", "subscription_start_date", "DATE DEFAULT CURRENT_DATE")
        print("Users table changes applied successfully.")

        try:
            cursor.execute("SELECT 1 FROM inventory_master_grn LIMIT 1")
            # If it exists with bigint, let's drop it since it has no data anyway
            cursor.execute("DROP TABLE IF EXISTS inventory_master_grn")
            print("Dropped inventory_master_grn to recreate.")
        except Exception as e:
            pass
            
        print("Creating inventory_master_grn...")
        cursor.execute("""
        CREATE TABLE inventory_master_grn (
            id bigint AUTO_INCREMENT PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            created_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
            updated_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            name varchar(255) NOT NULL DEFAULT 'GRN Series',
            grn_type varchar(100) NOT NULL DEFAULT 'other',
            prefix varchar(50) DEFAULT NULL,
            suffix varchar(50) DEFAULT NULL,
            year varchar(4) NOT NULL DEFAULT '2024',
            required_digits int NOT NULL DEFAULT 4,
            preview varchar(255) DEFAULT NULL,
            is_active boolean NOT NULL DEFAULT 1
        );
        """)
        print("Created inventory_master_grn.")
        
        try:
            cursor.execute("SELECT 1 FROM inventory_master_issueslip LIMIT 1")
            cursor.execute("DROP TABLE IF EXISTS inventory_master_issueslip")
            print("Dropped inventory_master_issueslip to recreate.")
        except Exception as e:
            pass
            
        print("Creating inventory_master_issueslip...")
        cursor.execute("""
        CREATE TABLE inventory_master_issueslip (
            id bigint AUTO_INCREMENT PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            created_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
            updated_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            name varchar(255) NOT NULL DEFAULT 'Issue Slip Series',
            issue_slip_type varchar(100) NOT NULL DEFAULT 'other',
            prefix varchar(50) DEFAULT NULL,
            suffix varchar(50) DEFAULT NULL,
            year varchar(4) NOT NULL DEFAULT '2024',
            required_digits int NOT NULL DEFAULT 4,
            preview varchar(255) DEFAULT NULL,
            is_active boolean NOT NULL DEFAULT 1
        );
        """)
        print("Created inventory_master_issueslip.")

        connection.commit()

if __name__ == '__main__':
    run_updates()
