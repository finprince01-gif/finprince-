
import os
import django
import random
from datetime import date
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def seed_transactions():
    print("Seeding Vendor Transactions...")
    
    with connection.cursor() as cursor:
        tenant_id = None
        cursor.execute("SELECT id FROM tenants LIMIT 1")
        row = cursor.fetchone()
        if not row:
             cursor.execute("SELECT tenant_id FROM users LIMIT 1")
             row = cursor.fetchone()
        if row: tenant_id = row[0]
        
        if not tenant_id:
            print("No tenant.")
            return

        # 1. Inspect Columns (Safety Check)
        print("Checking tables...")
        cursor.execute("DESCRIBE vendor_transaction_po")
        po_cols = [c[0].lower() for c in cursor.fetchall()]
        print(f"PO Cols: {po_cols}")
        
        cursor.execute("DESCRIBE vendor_transaction_po_items")
        item_cols = [c[0].lower() for c in cursor.fetchall()]
        print(f"PO Item Cols: {item_cols}")
        
        # 2. Get Dependencies
        # Vendors
        cursor.execute(f"SELECT id, vendor_name FROM vendor_master_basicdetail WHERE tenant_id='{tenant_id}'")
        vendors = cursor.fetchall()
        if not vendors:
            print("No vendors found! Run fix_vendor_portal_final.py first.")
            return

        # PO Series
        cursor.execute(f"SELECT id FROM vendor_master_posettings WHERE tenant_id='{tenant_id}' LIMIT 1")
        po_series = cursor.fetchone()
        po_series_id = po_series[0] if po_series else None
        
        # 3. Seed POs
        for vid, vname in vendors:
            for i in range(2): # 2 POs per vendor
                po_num = f"PO/{random.randint(1000,9999)}"
                
                # Check exist
                cursor.execute(f"SELECT id FROM vendor_transaction_po WHERE po_number='{po_num}'")
                if cursor.fetchone(): continue
                
                # Insert PO
                # Correct column names based on model: vendor_basic_detail_id (FK)
                sql = f"""
                    INSERT INTO vendor_transaction_po
                    (tenant_id, po_number, po_series_id, vendor_basic_detail_id, vendor_name, status, total_value, is_active, created_at, updated_at)
                    VALUES
                    ('{tenant_id}', '{po_num}', {po_series_id or 'NULL'}, {vid}, '{vname}', 'Approved', 1000.00, 1, NOW(), NOW())
                """
                cursor.execute(sql)
                po_id = cursor.lastrowid
                print(f"Created PO: {po_num} for {vname}")
                


                # 4. Seed Items
                for j in range(2):
                    item_name = f"Item-{random.randint(100,999)}"
                    item_code = f"IC-{random.randint(1000,9999)}"
                    
                    # Insert Item
                    # Table: vendor_transaction_po_items
                    sql_item = f"""
                        INSERT INTO vendor_transaction_po_items
                        (tenant_id, po_id, item_code, item_name, quantity, uom, negotiated_rate, final_rate, taxable_value, invoice_value, is_active, created_at, updated_at)
                        VALUES
                        ('{tenant_id}', {po_id}, '{item_code}', '{item_name}', 10, 'Nos', 100.00, 100.00, 1000.00, 1000.00, 1, NOW(), NOW())
                    """
                    cursor.execute(sql_item)
                    print(f"  - Added Item: {item_name}")

    print("Done.")

if __name__ == '__main__':
    seed_transactions()
