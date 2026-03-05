from django.db import connection
with connection.cursor() as cursor:
    try:
        cursor.execute("ALTER TABLE invoice_ocr_temp ADD COLUMN validation_status VARCHAR(20) DEFAULT 'PENDING' AFTER processed")
        print("Successfully added validation_status column.")
    except Exception as e:
        print(f"Error: {e}")
