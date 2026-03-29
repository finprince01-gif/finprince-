from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with connection.cursor() as cursor:
    try:
        # Check if narration already exists
        cursor.execute("DESCRIBE payment_vouchers")
        cols = [row[0] for row in cursor.fetchall()]
        
        if 'narration' not in cols:
            if 'notes' in cols:
                print("Renaming 'notes' to 'narration' in payment_vouchers...")
                cursor.execute("ALTER TABLE payment_vouchers CHANGE notes narration LONGTEXT;")
            else:
                print("Adding 'narration' to payment_vouchers...")
                cursor.execute("ALTER TABLE payment_vouchers ADD COLUMN narration LONGTEXT;")
        
        # Remove deprecated fields if they exist
        for deprecated in ['advance_ref_no', 'advance_amount']:
            if deprecated in cols:
                print(f"Removing deprecated column '{deprecated}' from payment_vouchers...")
                cursor.execute(f"ALTER TABLE payment_vouchers DROP COLUMN {deprecated};")
                
        print("Table 'payment_vouchers' synchronized with model.")
    except Exception as e:
        print(f"Error synchronizing 'payment_vouchers': {e}")
