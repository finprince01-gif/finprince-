
import os
import django
import re
import random
from datetime import date
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def fix_tabs():
    print("Fixing Inventory Tabs...")
    
    # 1. Read schema
    with open('../schema.sql', 'r', encoding='utf-8') as f:
        schema = f.read()

    with connection.cursor() as cursor:
        tenant_id = None
        cursor.execute("SELECT id FROM tenants LIMIT 1")
        row = cursor.fetchone()
        if not row:
             cursor.execute("SELECT tenant_id FROM users LIMIT 1")
             row = cursor.fetchone()
        if row: tenant_id = row[0]
        
        if not tenant_id:
            print("No tenant. Aborting.")
            return

        # ==========================================================
        # 1. GRN Series (inventory_master_grn)
        # ==========================================================
        print("\n--- GRN Master ---")
        try:
            cursor.execute("SELECT COUNT(*) FROM inventory_master_grn")
            print("Table exists.")
        except:
            print("Table missing. Recreating...")
            match = re.search(r"(CREATE TABLE `inventory_master_grn` .*?;)", schema, re.DOTALL | re.IGNORECASE)
            if match:
                cursor.execute(match.group(1))
                print("Table recreated.")
            else:
                print("Schema not found for GRN!")

        # Seed GRN Series
        grns = [
            ('Purchase GRN', 'purchase', 'GRN/PUR/', '/2025'),
            ('Jobwork GRN', 'job_work', 'GRN/JW/', '/2025'),
            ('Import GRN', 'import', 'GRN/IMP/', '/2025')
        ]
        for name, gtype, prefix, suffix in grns:
            cursor.execute(f"SELECT id FROM inventory_master_grn WHERE name='{name}' AND tenant_id='{tenant_id}'")
            if not cursor.fetchone():
                cursor.execute(f"""
                    INSERT INTO inventory_master_grn 
                    (tenant_id, name, grn_type, prefix, suffix, year, required_digits, is_active, created_at, updated_at)
                    VALUES 
                    ('{tenant_id}', '{name}', '{gtype}', '{prefix}', '{suffix}', '2025', 4, 1, NOW(), NOW())
                """)
                print(f"Seeded GRN Series: {name}")

        # ==========================================================
        # 2. Issue Slip Series (inventory_master_issueslip)
        # ==========================================================
        print("\n--- Issue Slip Master ---")
        try:
            cursor.execute("SELECT COUNT(*) FROM inventory_master_issueslip")
            print("Table exists.")
        except:
            print("Table missing. Recreating...")
            match = re.search(r"(CREATE TABLE `inventory_master_issueslip` .*?;)", schema, re.DOTALL | re.IGNORECASE)
            if match:
                cursor.execute(match.group(1))
                print("Table recreated.")
            else:
                print("Schema not found for Issue Slip!")

        # Seed Issue Slip Series
        slips = [
            ('Production Slip', 'internal_transfer', 'ISS/PROD/', '/2025'),
            ('Material Request', 'damage', 'ISS/MAT/', '/2025'),
        ]
        for name, stype, prefix, suffix in slips:
            cursor.execute(f"SELECT id FROM inventory_master_issueslip WHERE name='{name}' AND tenant_id='{tenant_id}'")
            if not cursor.fetchone():
                cursor.execute(f"""
                    INSERT INTO inventory_master_issueslip 
                    (tenant_id, name, issue_slip_type, prefix, suffix, year, required_digits, is_active, created_at, updated_at)
                    VALUES 
                    ('{tenant_id}', '{name}', '{stype}', '{prefix}', '{suffix}', '2025', 4, 1, NOW(), NOW())
                """)
                print(f"Seeded Issue Slip: {name}")

        # ==========================================================
        # 3. Operations: Inter-Unit (inventory_operation_interunit)
        # ==========================================================
        print("\n--- Inter-Unit Operations ---")

        # Ensure items exist
        cursor.execute("DESCRIBE inventory_stock_items")
        cols = [col[0] for col in cursor.fetchall()]
        name_col = 'name' if 'name' in cols else 'item_name'
        
        cursor.execute(f"SELECT {name_col}, unit, rate FROM inventory_stock_items WHERE tenant_id='{tenant_id}' LIMIT 1")
        item = cursor.fetchone()
        
        if item:
             iname, unit, rate = item
             import json
             items_json = json.dumps([{
                 "item_name": iname, "unit": unit, "quantity": 10, "rate": float(rate)
             }])
             
             for i in range(3):
                 slip = f"IU-{random.randint(1000, 9999)}"
                 cursor.execute(f"SELECT id FROM inventory_operation_interunit WHERE issue_slip_no='{slip}'")
                 if not cursor.fetchone():
                     sql = f"""
                         INSERT INTO inventory_operation_interunit
                         (tenant_id, issue_slip_no, date, goods_from_location, goods_to_location, items, status, created_at, updated_at)
                         VALUES
                         ('{tenant_id}', '{slip}', '{date.today()}', 'Main Warehouse', 'Factory Store', '{items_json}', 'Confirmed', NOW(), NOW())
                     """
                     cursor.execute(sql)
                     print(f"Seeded Inter-Unit: {slip}")
        
    print("\nDone.")

if __name__ == '__main__':
    fix_tabs()
