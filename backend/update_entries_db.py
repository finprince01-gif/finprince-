import os, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

sql_commands = """
ALTER TABLE entries ADD COLUMN customer_id BIGINT NULL;
ALTER TABLE entries ADD COLUMN vendor_id BIGINT NULL;
ALTER TABLE entries ADD CONSTRAINT fk_entries_customer FOREIGN KEY (customer_id) REFERENCES customer_master_customer_basicdetails(id) ON DELETE SET NULL;
ALTER TABLE entries ADD CONSTRAINT fk_entries_vendor FOREIGN KEY (vendor_id) REFERENCES vendor_master_vendorcreation_basicdetail(id) ON DELETE SET NULL;
"""

with connection.cursor() as cursor:
    for cmd in sql_commands.strip().split(';'):
        if cmd.strip():
            print(f"Executing: {cmd.strip()}")
            try:
                cursor.execute(cmd.strip())
                print("Success.")
            except Exception as e:
                print(f"Error: {e}")
