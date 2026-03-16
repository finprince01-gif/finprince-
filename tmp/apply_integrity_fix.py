import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def apply_final_fix():
    with connection.cursor() as cursor:
        # Tables and their foreign keys
        schema_work = {
            'voucher_receipt_single': {
                'cols': ['receive_in_ledger_id', 'receive_from_ledger_id'],
                'fks': ['fk_vrs_receive_in', 'fk_vrs_receive_from']
            },
            'voucher_payment_single': {
                'cols': ['pay_from_ledger_id', 'pay_to_ledger_id'],
                'fks': ['fk_vps_pay_from', 'fk_vps_pay_to']
            }
        }

        # Step 0: Ensure NO NULLs (again, to be safe)
        cursor.execute("SELECT id FROM master_ledgers LIMIT 1")
        placeholder_id = cursor.fetchone()[0]

        for table, info in schema_work.items():
            print(f"Applying fix to {table}...")
            # Fix NULLs
            for col in info['cols']:
                cursor.execute(f"UPDATE {table} SET {col} = {placeholder_id} WHERE {col} IS NULL")
            
            # Drop FKs
            for fk in info['fks']:
                try:
                    cursor.execute(f"ALTER TABLE {table} DROP FOREIGN KEY {fk}")
                    print(f"Dropped {fk}")
                except Exception as e:
                    print(f"Warning: Could not drop {fk}: {e}")

            # Modify Columns to NOT NULL
            for col in info['cols']:
                cursor.execute(f"ALTER TABLE {table} MODIFY {col} BIGINT NOT NULL")
                print(f"Modified {col} to NOT NULL")

            # Add FKs back with RESTRICT
            for i, fk in enumerate(info['fks']):
                col = info['cols'][i]
                cursor.execute(f"ALTER TABLE {table} ADD CONSTRAINT {fk} FOREIGN KEY ({col}) REFERENCES master_ledgers(id) ON DELETE RESTRICT")
                print(f"Re-added {fk} with ON DELETE RESTRICT")

        print("All database integrity constraints applied successfully.")

if __name__ == "__main__":
    apply_final_fix()
