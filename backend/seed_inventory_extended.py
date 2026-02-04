
import os
import django
import json
import random
from datetime import date
from decimal import Decimal
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def seed_extended():
    print("Starting Extended Inventory Seeding...")
    with connection.cursor() as cursor:
        # 1. Get Tenant
        tenant_id = None
        cursor.execute("SELECT id FROM tenants LIMIT 1")
        row = cursor.fetchone()
        if row:
            tenant_id = row[0]
        else:
            cursor.execute("SELECT tenant_id FROM users LIMIT 1")
            row = cursor.fetchone()
            if row:
                tenant_id = row[0]
        
        if not tenant_id:
            print("No tenant ID found. Aborting.")
            return

        print(f"Using Tenant: {tenant_id}")

        # 2. Seed Units & Groups
        print("Seeding Units & Groups...")
        units = [('Pcs', 'PCS'), ('Box', 'BOX'), ('Kg', 'KGS'), ('Ltr', 'LTR')]
        for name, sym in units:
            cursor.execute(f"SELECT id FROM inventory_units WHERE name='{name}' AND tenant_id='{tenant_id}'")
            if not cursor.fetchone():
                cursor.execute(f"INSERT INTO inventory_units (tenant_id, name, symbol, created_at, updated_at) VALUES ('{tenant_id}', '{name}', '{sym}', NOW(), NOW())")
        
        groups = [('Raw Materials', None), ('Finished Goods', None), ('Electronics', None), ('Hardware', None)]
        for name, parent in groups:
            cursor.execute(f"SELECT id FROM inventory_stock_groups WHERE name='{name}' AND tenant_id='{tenant_id}'")
            if not cursor.fetchone():
                cursor.execute(f"INSERT INTO inventory_stock_groups (tenant_id, name, created_at, updated_at) VALUES ('{tenant_id}', '{name}', NOW(), NOW())")


        # 3. Get Items for Operations
        cursor.execute("DESCRIBE inventory_stock_items")
        cols = [col[0] for col in cursor.fetchall()]
        name_col = 'name' if 'name' in cols else 'item_name'
        
        cursor.execute(f"SELECT {name_col}, unit, rate FROM inventory_stock_items WHERE tenant_id='{tenant_id}' LIMIT 5")
        items = cursor.fetchall()

        item_list = [{"item_name": i[0], "unit": i[1], "rate": float(i[2])} for i in items]
        
        if not item_list:
            print("No items found. Skipping operations.")
            return

        def get_rand_items():
            return json.dumps([{**random.choice(item_list), "quantity": random.randint(1, 50)}])

        # 4. Seed Operations
        # Jobwork
        print("Seeding Jobwork...")
        for i in range(3):
            ref = f"JW-OUT-{random.randint(1000,9999)}"
            cursor.execute(f"SELECT id FROM inventory_operation_jobwork WHERE job_work_outward_no='{ref}'")
            if not cursor.fetchone():
                sql = f"""
                    INSERT INTO inventory_operation_jobwork
                    (tenant_id, operation_type, job_work_outward_no, items, status, is_active, created_at, updated_at)
                    VALUES ('{tenant_id}', 'outward', '{ref}', '{get_rand_items()}', 'Posted', 1, NOW(), NOW())
                """
                cursor.execute(sql)

        # Location Change
        print("Seeding Location Change...")
        for i in range(3):
            slip = f"LOC-CHG-{random.randint(1000,9999)}"
            cursor.execute(f"SELECT id FROM inventory_operation_locationchange WHERE issue_slip_no='{slip}'")
            if not cursor.fetchone():
                sql = f"""
                    INSERT INTO inventory_operation_locationchange
                    (tenant_id, issue_slip_no, goods_from_location, goods_to_location, items, status, created_at, updated_at)
                    VALUES ('{tenant_id}', '{slip}', 'Warehouse A', 'Store B', '{get_rand_items()}', 'Confirmed', NOW(), NOW())
                """
                cursor.execute(sql)

        # Scrap
        print("Seeding Scrap...")
        for i in range(3):
            slip = f"SCRAP-{random.randint(1000,9999)}"
            cursor.execute(f"SELECT id FROM inventory_operation_scrap WHERE issue_slip_no='{slip}'")
            if not cursor.fetchone():
                sql = f"""
                    INSERT INTO inventory_operation_scrap
                    (tenant_id, issue_slip_no, items, status, created_at, updated_at)
                    VALUES ('{tenant_id}', '{slip}', '{get_rand_items()}', 'Confirmed', NOW(), NOW())
                """
                cursor.execute(sql)
        
        connection.commit()


        # 5. SYNC STOCK MOVEMENTS
        print("Syncing Stock Movements (Reporting)...")
        # Define sources: Table, ID Col, Date Col, Trans Type, Movement Type
        sources = [
            ('inventory_operation_grn', 'id', 'date', 'purchase', 'in'),
            ('inventory_operation_outward', 'id', 'date', 'sales', 'out'),
            ('inventory_operation_production', 'id', 'date', 'production', 'in'),
            ('inventory_operation_consumption', 'id', 'date', 'consumption', 'out'),
            ('inventory_operation_jobwork', 'id', 'transaction_date', 'jobwork', 'out'),
            ('inventory_operation_scrap', 'id', 'date', 'scrap', 'out')
        ]

        synced_count = 0
        for table, id_col, date_col, trans_type, move_type in sources:
            cursor.execute(f"SELECT {id_col}, items, {date_col}, created_at FROM {table} WHERE tenant_id='{tenant_id}'")
            rows = cursor.fetchall()
            
            for row in rows:
                tid, items_blob, tdate, created = row
                if not tdate: tdate = date.today()
                
                # Check if exists
                cursor.execute(f"SELECT id FROM stock_movements WHERE transaction_type='{trans_type}' AND transaction_id={tid}")
                if cursor.fetchone():
                    continue

                # Parse items
                try:
                    if isinstance(items_blob, str):
                        items_data = json.loads(items_blob)
                    else:
                        items_data = items_blob
                except:
                    continue
                    
                if not items_data: continue

                for item in items_data:
                    iname = item.get('item_name') or item.get('name')
                    qty = item.get('quantity') or 0
                    rate = item.get('rate') or 0
                    
                    if not iname: continue
                    
                    # Insert Movement
                    sql = f"""
                        INSERT INTO stock_movements
                        (tenant_id, stock_item, transaction_type, transaction_id, transaction_date, quantity, movement_type, rate, amount, balance_quantity, created_at, updated_at)
                        VALUES
                        ('{tenant_id}', '{iname}', '{trans_type}', {tid}, '{tdate}', {qty}, '{move_type}', {rate}, {qty*rate}, 0, '{created}', NOW())
                    """
                    cursor.execute(sql)
                    synced_count += 1
        
        connection.commit()
        print(f"Synced {synced_count} movement records.")

if __name__ == '__main__':
    seed_extended()
