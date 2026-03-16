import os
import django # type: ignore
from django.db import connection # type: ignore

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def apply_missing_columns():
    with connection.cursor() as cursor:
        print("Checking for missing columns in bank_statement_transactions...")
        
        # Check current columns
        cursor.execute("DESCRIBE bank_statement_transactions")
        columns = [row[0] for row in cursor.fetchall()]
        
        to_add = {
            'cheque_number': "VARCHAR(100) DEFAULT NULL",
            'running_balance': "DECIMAL(15,2) NOT NULL DEFAULT 0.00",
            'import_batch_id': "VARCHAR(100) DEFAULT NULL",
            'match_method': "VARCHAR(50) DEFAULT NULL"
        }
        
        for col, col_def in to_add.items():
            if col not in columns:
                print(f"Adding column {col}...")
                cursor.execute(f"ALTER TABLE bank_statement_transactions ADD COLUMN {col} {col_def}")
                print(f"Column {col} added.")
            else:
                print(f"Column {col} already exists.")

if __name__ == "__main__":
    try:
        apply_missing_columns()
        print("Done.")
    except Exception as e:
        print(f"Error: {e}")
