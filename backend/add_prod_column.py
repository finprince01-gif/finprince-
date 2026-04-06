import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    # Check if column already exists
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='inventory_operation_production' 
        AND column_name='issue_slip_series'
    """)
    exists = cursor.fetchone()
    
    if not exists:
        cursor.execute("""
            ALTER TABLE inventory_operation_production 
            ADD COLUMN issue_slip_series VARCHAR(255) NULL
        """)
        print("Column 'issue_slip_series' added to inventory_operation_production successfully.")
    else:
        print("Column 'issue_slip_series' already exists.")
