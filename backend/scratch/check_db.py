import os
import django
import sys

# Add the project root to sys.path
sys.path.append('c:/108/AI-accounting-0.03 (9)/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("DESCRIBE invoice_processing_items")
    columns = [col[0] for col in cursor.fetchall()]
    print(f"Columns in invoice_processing_items: {columns}")
    
    if 'staging_record_id' in columns:
        print("SUCCESS: staging_record_id exists.")
    else:
        print("FAILURE: staging_record_id is missing.")
