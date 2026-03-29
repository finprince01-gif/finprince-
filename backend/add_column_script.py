from django.db import connection
try:
    with connection.cursor() as cursor:
        cursor.execute("ALTER TABLE receipt_voucher_items ADD COLUMN pending_transaction varchar(255) DEFAULT NULL AFTER reference_type")
        print("Successfully added pending_transaction column to receipt_voucher_items table.")
except Exception as e:
    print(f"Error adding column: {str(e)}")
