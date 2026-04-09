import os
import mysql.connector
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def column_exists(cursor, table, column):
    cursor.execute(f"SHOW COLUMNS FROM {table} LIKE '{column}'")
    return cursor.fetchone() is not None

def fix_tables():
    try:
        # Establish database connection
        conn = mysql.connector.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            user=os.getenv('DB_USER', 'root'),
            password=os.getenv('DB_PASSWORD', ''),
            database=os.getenv('DB_NAME', 'ai_accounting'),
            port=int(os.getenv('DB_PORT', 3306))
        )
        cursor = conn.cursor()

        print("Updating Credit Note tables...")

        # 1. Update voucher_credit_note_invoice_details
        table = "voucher_credit_note_invoice_details"
        columns_to_add = [
            ("sales_invoice_nos", "TEXT", "gstin"),
            ("sales_invoice_dates", "TEXT", "sales_invoice_nos")
        ]
        for col, col_type, after in columns_to_add:
            if not column_exists(cursor, table, col):
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type} AFTER {after}")
                print(f"Added {col} to {table}")
            else:
                print(f"Column {col} already exists in {table}")

        # 2. Update voucher_credit_note_due_details
        table = "voucher_credit_note_due_details"
        columns_to_add = [
            ("advance_amount", "DECIMAL(15, 2) DEFAULT 0", "income_tax_tds_tcs_amount"),
            ("payable_amount", "DECIMAL(15, 2) DEFAULT 0", "advance_amount")
        ]
        for col, col_type, after in columns_to_add:
            if not column_exists(cursor, table, col):
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type} AFTER {after}")
                print(f"Added {col} to {table}")
            else:
                print(f"Column {col} already exists in {table}")

        conn.commit()
        print("All tables processed successfully!")

    except mysql.connector.Error as err:
        print(f"Error: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    fix_tables()
