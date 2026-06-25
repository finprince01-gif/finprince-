from django.db import migrations, models

def add_columns_if_not_exists(apps, schema_editor):
    connection = schema_editor.connection
    cursor = connection.cursor()
    
    # Check existing columns in invoice_ocr_temp
    cursor.execute("DESCRIBE invoice_ocr_temp;")
    columns = [row[0] for row in cursor.fetchall()]
    
    if 'normalized_invoice_no' not in columns:
        cursor.execute("ALTER TABLE invoice_ocr_temp ADD COLUMN normalized_invoice_no VARCHAR(100) NULL;")
    if 'vendor_confidence' not in columns:
        cursor.execute("ALTER TABLE invoice_ocr_temp ADD COLUMN vendor_confidence DOUBLE NULL;")
    if 'gstin_confidence' not in columns:
        cursor.execute("ALTER TABLE invoice_ocr_temp ADD COLUMN gstin_confidence DOUBLE NULL;")
    if 'invoice_number_confidence' not in columns:
        cursor.execute("ALTER TABLE invoice_ocr_temp ADD COLUMN invoice_number_confidence DOUBLE NULL;")

def backfill_normalized_invoice_no(apps, schema_editor):
    from vendors.vendor_validation_logic import normalize_invoice_number
    connection = schema_editor.connection
    cursor = connection.cursor()
    
    cursor.execute("SELECT id, supplier_invoice_no FROM invoice_ocr_temp WHERE supplier_invoice_no IS NOT NULL AND supplier_invoice_no != '';")
    rows = cursor.fetchall()
    
    for row_id, supplier_invoice_no in rows:
        normalized = normalize_invoice_number(supplier_invoice_no)
        cursor.execute("UPDATE invoice_ocr_temp SET normalized_invoice_no = %s WHERE id = %s;", [normalized, row_id])

def remove_columns(apps, schema_editor):
    connection = schema_editor.connection
    cursor = connection.cursor()
    
    cursor.execute("DESCRIBE invoice_ocr_temp;")
    columns = [row[0] for row in cursor.fetchall()]
    
    if 'normalized_invoice_no' in columns:
        cursor.execute("ALTER TABLE invoice_ocr_temp DROP COLUMN normalized_invoice_no;")
    if 'vendor_confidence' in columns:
        cursor.execute("ALTER TABLE invoice_ocr_temp DROP COLUMN vendor_confidence;")
    if 'gstin_confidence' in columns:
        cursor.execute("ALTER TABLE invoice_ocr_temp DROP COLUMN gstin_confidence;")
    if 'invoice_number_confidence' in columns:
        cursor.execute("ALTER TABLE invoice_ocr_temp DROP COLUMN invoice_number_confidence;")

class Migration(migrations.Migration):

    dependencies = [
        ('ocr_pipeline', '0024_rescanhistory_aiusageaccounting'),
    ]

    operations = [
        migrations.RunPython(add_columns_if_not_exists, remove_columns),
        migrations.RunPython(backfill_normalized_invoice_no, migrations.RunPython.noop),
    ]
