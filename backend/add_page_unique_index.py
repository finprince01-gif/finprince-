"""
Apply page-level unique index to invoice_processing_items.
Safe to run multiple times.
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

c = connection.cursor()
c.execute("""
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name   = 'invoice_processing_items'
      AND index_name   = 'uq_page_per_item'
""")
already_exists = c.fetchone()[0]

if already_exists:
    print("Index uq_page_per_item already exists – skipping.")
else:
    c.execute("""
        CREATE UNIQUE INDEX uq_page_per_item
        ON invoice_processing_items (job_id, page_number, parent_item_id)
    """)
    connection.commit()
    print("Created unique index: uq_page_per_item on (job_id, page_number, parent_item_id)")
