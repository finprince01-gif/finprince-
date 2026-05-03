"""
Script to add ref_no column to bank_statement_temp table.
Run with: python manage.py shell < fix_bank_ref_no.py
"""
import django
from django.db import connection

cursor = connection.cursor()

# Check if column already exists
cursor.execute("""
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'bank_statement_temp' 
    AND COLUMN_NAME = 'ref_no'
""")
exists = cursor.fetchone()[0]

if exists:
    print("INFO: ref_no column already exists in bank_statement_temp — skipping.")
else:
    cursor.execute("""
        ALTER TABLE bank_statement_temp 
        ADD COLUMN ref_no VARCHAR(150) NULL DEFAULT NULL
    """)
    print("SUCCESS: ref_no column added to bank_statement_temp")
