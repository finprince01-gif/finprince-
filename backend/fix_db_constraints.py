import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with connection.cursor() as cursor:
    print("Dropping old constraint...")
    try:
        cursor.execute('ALTER TABLE invoice_ocr_temp DROP INDEX invoice_ocr_temp_tenant_id_file_hash_e3413772_uniq')
        print("Dropped.")
    except Exception as e:
        print(f"Error dropping index: {e}")

    print("Adding new session-aware constraint...")
    try:
        # We need to make sure upload_session_id is not null for the unique key to be effective in all cases, 
        # or handle nulls if necessary.
        cursor.execute('ALTER TABLE invoice_ocr_temp ADD UNIQUE KEY invoice_ocr_temp_session_uniq (tenant_id, file_hash, upload_session_id)')
        print("Success.")
    except Exception as e:
        print(f"Error adding index: {e}")
