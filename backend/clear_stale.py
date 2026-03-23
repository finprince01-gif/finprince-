import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute(
        "UPDATE invoice_ocr_temp SET validation_status='EXTRACTION_FAILED', status='EXTRACTION_FAILED' WHERE validation_status IN ('PROCESSING', 'PENDING')"
    )
    print(f"Cleared {cursor.rowcount} stale row(s). You can now retry uploading.")
