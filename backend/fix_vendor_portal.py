
import os
import django
import re
import random
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def fix_vendor_portal():
    print("Fixing Vendor Portal Tables...")
    
    # 1. Read schema
    with open('../schema.sql', 'r', encoding='utf-8') as f:
        schema = f.read()

    tenant_id = None
    with connection.cursor() as cursor:
        cursor.execute("SELECT id FROM tenants LIMIT 1")
        row = cursor.fetchone()
        if not row:
             cursor.execute("SELECT tenant_id FROM users LIMIT 1")
             row = cursor.fetchone()
        if row: tenant_id = row[0]
    
    if not tenant_id:
        print("No tenant found.")
        return

    tables_to_fix = [
        'vendor_master_category',
        'vendor_master_banking',
        'vendor_master_tds',
        'vendor_master_terms',
        'vendor_master_productservices'
    ]

    with connection.cursor() as cursor:
        # 2. Restore Tables
        for table in tables_to_fix:
            print(f"\n--- Checking {table} ---")
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                print("Table exists.")
            except:
                print("Table missing. Recreating...")
                # Regex to capture CREATE TABLE `table_name` (...);
                pattern = f"(CREATE TABLE `{table}` .*?;)"
                match = re.search(pattern, schema, re.DOTALL | re.IGNORECASE)
                if match:
                    try:
                        cursor.execute(match.group(1))
                        print("Table recreated.")
                    except Exception as e:
                        print(f"Error creating {table}: {e}")
                else:
                    print(f"Schema not found for {table}!")

        # 3. Seed Data
        print("\n--- Seeding Data ---")
        

        # A. Vendor Category
        cats = ['Raw Material Supplier', 'Service Provider', 'Logistics Partner']
        

        # Check column name
        print("Checking vendor_master_category columns...")
        cursor.execute("DESCRIBE vendor_master_category")
        cols = [col[0] for col in cursor.fetchall()]
        print(f"Category cols: {cols}")
        
        # Determine PK
        cat_id_col = 'id' if 'id' in cols else cols[0]

        # Common variations: 'name', 'category_name', 'category', 'type'
        name_col = 'name'
        if 'category_name' in cols: name_col = 'category_name'
        elif 'category' in cols: name_col = 'category'
        elif 'type' in cols: name_col = 'type'
        
        print(f"Using PK '{cat_id_col}' and Name '{name_col}' for Vendor Category")

        for c in cats:
            cursor.execute(f"SELECT {cat_id_col} FROM vendor_master_category WHERE {name_col}='{c}' AND tenant_id='{tenant_id}'")
            if not cursor.fetchone():
                cursor.execute(f"INSERT INTO vendor_master_category (tenant_id, {name_col}, is_active, created_at, updated_at) VALUES ('{tenant_id}', '{c}', 1, NOW(), NOW())")
                print(f"Seeded Category: {c}")


        # Get existing vendors
        print("Checking vendor_master_basicdetail columns...")
        cursor.execute("DESCRIBE vendor_master_basicdetail")
        vcols = [col[0] for col in cursor.fetchall()]
        print(f"Vendor cols: {vcols}")
        
        vid_col = 'id' if 'id' in vcols else vcols[0] # Fallback to first col (usually PK)
        vname_col = 'vendor_name' if 'vendor_name' in vcols else 'name'
        
        cursor.execute(f"SELECT {vid_col}, {vname_col} FROM vendor_master_basicdetail WHERE tenant_id='{tenant_id}'")
        vendors = cursor.fetchall()
        
        if not vendors:
            print("No vendors found to seed details for.")
            return


        for vid, vname in vendors:
            print(f"Seeding details for {vname} ({vid})...")
            
            # Helper to check if record exists safely
            def check_exists(tbl, where_col, val):
                print(f"  Checking {tbl} columns...")
                cursor.execute(f"DESCRIBE {tbl}")
                cols = [c[0] for c in cursor.fetchall()]
                pk = 'id' if 'id' in cols else cols[0]
                wc = where_col if where_col in cols else None
                if not wc:
                    print(f"    ERROR: Col {where_col} not found in {tbl}! Cols: {cols}")
                    return True # Skip to avoid crash
                
                print(f"    Querying {tbl} where {wc}={val}...")
                cursor.execute(f"SELECT {pk} FROM {tbl} WHERE {wc}={val}")
                return cursor.fetchone()

            # B. Banking
            if not check_exists('vendor_master_banking', 'vendor_id', vid):
                cursor.execute(f"""
                    INSERT INTO vendor_master_banking 
                    (tenant_id, vendor_id, bank_name, account_number, ifsc_code, branch_name, is_active, created_at, updated_at)
                    VALUES 
                    ('{tenant_id}', {vid}, 'HDFC Bank', '50100{random.randint(10000,99999)}', 'HDFC0001234', 'Mumbai Branch', 1, NOW(), NOW())
                """)
                print("  - Banking info added")

            # C. TDS
            if not check_exists('vendor_master_tds', 'vendor_id', vid):
                 cursor.execute(f"""
                    INSERT INTO vendor_master_tds
                    (tenant_id, vendor_id, deductee_type, tds_section, is_active, created_at, updated_at)
                    VALUES
                    ('{tenant_id}', {vid}, 'Company', '194C', 1, NOW(), NOW())
                 """)
                 print("  - TDS info added")
            
            # D. Terms
            if not check_exists('vendor_master_terms', 'vendor_id', vid):
                 cursor.execute(f"""
                    INSERT INTO vendor_master_terms
                    (tenant_id, vendor_id, payment_terms, credit_period_days, is_active, created_at, updated_at)
                    VALUES
                    ('{tenant_id}', {vid}, 'Net 30', 30, 1, NOW(), NOW())
                 """)
                 print("  - Terms added")

            # E. Product Services
            if not check_exists('vendor_master_productservices', 'vendor_id', vid):
                 cursor.execute(f"""
                    INSERT INTO vendor_master_productservices
                    (tenant_id, vendor_id, product_service_name, hsn_sac, is_active, created_at, updated_at)
                    VALUES
                    ('{tenant_id}', {vid}, 'Consulting Services', '998311', 1, NOW(), NOW())
                 """)
                 print("  - Product/Service added")

    print("\nVendor Portal Fix Completed.")

if __name__ == '__main__':
    fix_vendor_portal()
