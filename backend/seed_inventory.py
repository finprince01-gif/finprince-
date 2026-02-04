
import os
import django
import json
import random
from datetime import date
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def seed():
    print("Starting Inventory Seeding...")
    with connection.cursor() as cursor:
        # 1. Get Tenant
        # Try tenants table first
        tenant_id = None
        try:
            cursor.execute("SELECT id FROM tenants LIMIT 1")
            row = cursor.fetchone()
            if row:
                tenant_id = row[0]
        except Exception:
            pass
            
        if not tenant_id:
            print("Checking users table for tenant_id...")
            cursor.execute("SELECT tenant_id FROM users LIMIT 1")
            row = cursor.fetchone()
            if row:
                tenant_id = row[0]
            
        if not tenant_id:
            print("No tenant ID found. Aborting.")
            return
        
        print(f"Using Tenant ID: {tenant_id}")

        # 2. Get Items
        # Check if table has 'name' or 'item_name'
        cursor.execute("DESCRIBE inventory_stock_items")
        cols = [col[0] for col in cursor.fetchall()]
        name_col = 'name' if 'name' in cols else 'item_name'
        
        cursor.execute(f"SELECT {name_col}, unit, rate FROM inventory_stock_items WHERE tenant_id = '{tenant_id}' LIMIT 5")
        items = cursor.fetchall()
        
        if not items:
            print("No stock items found. Creating seeds...")
            seed_items = [
                ('Raw Material A', 'Raw Materials', 'Kg', 100),
                ('Raw Material B', 'Raw Materials', 'Ltr', 50),
                ('Finished Good X', 'Finished Goods', 'Box', 1000)
            ]
            for name, group, unit, rate in seed_items:
                cursor.execute(f"""
                    INSERT INTO inventory_stock_items (tenant_id, {name_col}, `group`, unit, rate, created_at, updated_at)
                    VALUES ('{tenant_id}', '{name}', '{group}', '{unit}', {rate}, NOW(), NOW())
                """)
            connection.commit()
            print("Created seed items.")
            cursor.execute(f"SELECT {name_col}, unit, rate FROM inventory_stock_items WHERE tenant_id = '{tenant_id}' LIMIT 5")
            items = cursor.fetchall()
            
        print(f"Items available: {[i[0] for i in items]}")
        
        def get_rand_item():
            i = random.choice(items)
            return {"item_name": i[0], "unit": i[1], "rate": float(i[2]), "quantity": random.randint(1, 100)}

        # 3. Seed Production
        print("Seeding Production...")
        for i in range(5):
            input_item = get_rand_item()
            output_item = get_rand_item()
            
            items_json = json.dumps([
                {**input_item, "type": "input"},
                {**output_item, "type": "output"}
            ])
            
            # Check for existing
            slip = f'PROD-SEED-{i+100}'
            cursor.execute(f"SELECT id FROM inventory_operation_production WHERE issue_slip_no='{slip}' AND tenant_id='{tenant_id}'")
            if not cursor.fetchone():
                sql = f"""
                    INSERT INTO inventory_operation_production 
                    (tenant_id, issue_slip_no, date, status, production_type, items, created_at, updated_at)
                    VALUES 
                    ('{tenant_id}', '{slip}', '{date.today()}', 'Confirmed', 'finished_goods', '{items_json}', NOW(), NOW())
                """
                cursor.execute(sql)
            
        # 4. Seed Consumption
        print("Seeding Consumption...")
        for i in range(5):
            item = get_rand_item()
            items_json = json.dumps([item])
            slip = f'CONS-SEED-{i+100}'
            
            cursor.execute(f"SELECT id FROM inventory_operation_consumption WHERE issue_slip_no='{slip}' AND tenant_id='{tenant_id}'")
            if not cursor.fetchone():
                sql = f"""
                    INSERT INTO inventory_operation_consumption
                    (tenant_id, issue_slip_no, date, status, items, created_at, updated_at)
                    VALUES
                    ('{tenant_id}', '{slip}', '{date.today()}', 'Confirmed', '{items_json}', NOW(), NOW())
                """
                cursor.execute(sql)
            
        # 5. Seed GRN
        print("Seeding GRN...")
        for i in range(5):
            item = get_rand_item()
            items_json = json.dumps([item])
            no = f'GRN-SEED-{i+100}'
            
            cursor.execute(f"SELECT id FROM inventory_operation_grn WHERE grn_no='{no}' AND tenant_id='{tenant_id}'")
            if not cursor.fetchone():
                sql = f"""
                    INSERT INTO inventory_operation_grn
                    (tenant_id, grn_no, date, grn_type, items, vendor_name, created_at, updated_at)
                    VALUES
                    ('{tenant_id}', '{no}', '{date.today()}', 'purchase', '{items_json}', 'Seed Vendor', NOW(), NOW())
                """
                cursor.execute(sql)

        # 6. Seed Outward
        print("Seeding Outward...")
        for i in range(5):
            item = get_rand_item()
            items_json = json.dumps([item])
            no = f'OUT-SEED-{i+100}'
            
            cursor.execute(f"SELECT id FROM inventory_operation_outward WHERE outward_slip_no='{no}' AND tenant_id='{tenant_id}'")
            if not cursor.fetchone():
                sql = f"""
                    INSERT INTO inventory_operation_outward
                    (tenant_id, outward_slip_no, date, outward_type, items, customer_name, created_at, updated_at)
                    VALUES
                    ('{tenant_id}', '{no}', '{date.today()}', 'sales', '{items_json}', 'Seed Customer', NOW(), NOW())
                """
                cursor.execute(sql)
            
        connection.commit()
        print("Seeding Complete.")

if __name__ == '__main__':
    seed()
