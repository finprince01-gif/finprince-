import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("SHOW TABLES")
    tables = [row[0] for row in cursor.fetchall()]
    print("ALL TABLES:")
    for t in sorted(tables):
        if 'vendor' in t or 'gst' in t or 'basic' in t or 'creation' in t:
            print(f" -> {t}")
            
    # Show columns and row count of pending purchase queue table
    pp_table = None
    for t in tables:
        if 'pending_purchase' in t or 'pendingpurchase' in t:
            pp_table = t
            
    if pp_table:
        cursor.execute(f"DESCRIBE `{pp_table}`")
        columns = cursor.fetchall()
        print(f"\nCOLUMNS of {pp_table}:")
        for col in columns:
            print(f"  {col[0]}: {col[1]}")
            
        cursor.execute(f"SELECT COUNT(*) FROM `{pp_table}`")
        count = cursor.fetchone()[0]
        print(f"\nRow count of {pp_table}: {count}")
        
        # Show first few rows if any
        if count > 0:
            cursor.execute(f"SELECT id, source_scan_row_id, invoice_number, vendor_name, pending_purchase_status FROM `{pp_table}`")
            rows = cursor.fetchall()
            print("\nROWS:")
            for r in rows:
                print(f"  id={r[0]}, source_row={r[1]}, invoice_number={r[2]}, vendor_name={r[3]}, status={r[4]}")
    else:
        print("\nNo pending purchase table found!")
