import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def cleanup_unused_schema():
    cursor = connection.cursor()
    
    # 1. Drop Unused Tables
    unused_tables = [
        'answers', 'questions', 'company_informations', 'gst_apiusagelog',
        'journal_voucher_entry_lines', 'norm_debit_note_line_items_temp', # assuming temp
        'payment_allocation_details', 'payment_allocation_line_details',
        'receipt_allocation_details', 'transcaction_file', # I already renamed it
        'vendor_master_vendorcreation_productservices', # swapped for vendors_vendormasterproductservice
        'voucher_debit_note_due_details_temp',
        'voucher_journal_entries', 'voucher_payment_bulk', 'voucher_payment_single',
        'voucher_receipt_bulk', 'voucher_receipt_single'
    ]
    
    for table in unused_tables:
        try:
            print(f"Dropping unused table {table}...")
            cursor.execute(f"DROP TABLE IF EXISTS `{table}`")
        except Exception as e:
            print(f"Error dropping {table}: {e}")

    # 2. Drop Unused Columns in Active Tables
    # Table: users
    for col in ['first_name', 'last_name', 'date_joined', 'email_verified', 'login_status', 'last_activity']:
        try:
            cursor.execute(f"ALTER TABLE `users` DROP COLUMN `{col}`")
            print(f"Dropped users.{col}")
        except: pass
        
    # Table: tenants
    try:
        cursor.execute("ALTER TABLE `tenants` DROP COLUMN `updated_at`")
        print("Dropped tenants.updated_at")
    except: pass

    # Table: receipt_vouchers
    for col in ['receive_from_name', 'receive_in', 'receive_from']:
        try:
            cursor.execute(f"ALTER TABLE `receipt_vouchers` DROP COLUMN `{col}`")
            print(f"Dropped receipt_vouchers.{col}")
        except: pass
        
    # Table: receipt_voucher_items
    try:
        cursor.execute("ALTER TABLE `receipt_voucher_items` DROP COLUMN `receive_from_id`")
        print("Dropped receipt_voucher_items.receive_from_id")
    except: pass

if __name__ == "__main__":
    cleanup_unused_schema()
    print("Cleanup complete.")
