
import os
import django
import re
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def fix_location():
    print("Fixing Inventory Location Table...")
    
    # 1. Read schema.sql
    with open('../schema.sql', 'r', encoding='utf-8') as f:
        content = f.read()

    # 2. Extract CREATE TABLE
    match = re.search(r"(CREATE TABLE `inventory_master_location` .*?;)", content, re.DOTALL | re.IGNORECASE)
    
    if not match:
        print("Could not find CREATE TABLE inventory_master_location in schema.sql")
        # Fallback to manual creation if regex fails (based on model)
        sql = """
        CREATE TABLE `inventory_master_location` (
          `id` bigint NOT NULL AUTO_INCREMENT,
          `tenant_id` varchar(36) NOT NULL,
          `created_at` datetime(6) NOT NULL,
          `updated_at` datetime(6) NOT NULL,
          `created_by` varchar(255) DEFAULT NULL,
          `updated_by` varchar(255) DEFAULT NULL,
          `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
          `deleted_at` datetime(6) DEFAULT NULL,
          `name` varchar(255) NOT NULL,
          `location_type` varchar(50) NOT NULL,
          `address_line1` varchar(255) NOT NULL,
          `address_line2` varchar(255) DEFAULT NULL,
          `address_line3` varchar(255) DEFAULT NULL,
          `city` varchar(100) NOT NULL,
          `state` varchar(100) NOT NULL,
          `country` varchar(100) NOT NULL,
          `pincode` varchar(20) NOT NULL,
          `vendor_name` varchar(255) DEFAULT NULL,
          `customer_name` varchar(255) DEFAULT NULL,
          `gstin` varchar(15) DEFAULT NULL,
          PRIMARY KEY (`id`),
          KEY `inventory_master_location_tenant_idx` (`tenant_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """
        print("Using Fallback SQL.")
    else:
        sql = match.group(1)
        print("Found SQL in schema.")

    with connection.cursor() as cursor:
        try:
            cursor.execute(sql)
            print("Table created successfully.")
        except Exception as e:
            print(f"Error creating table: {e}")

        # 3. Seed Data
        print("Seeding Locations...")
        tenant_id = None
        cursor.execute("SELECT id FROM tenants LIMIT 1")
        row = cursor.fetchone()
        if row: tenant_id = row[0]
        else:
             cursor.execute("SELECT tenant_id FROM users LIMIT 1")
             row = cursor.fetchone()
             if row: tenant_id = row[0]

        if tenant_id:
            locs = [
                ('Main Warehouse', 'company_premises', '123 Main St', 'Mumbai', 'Maharashtra', '400001'),
                ('Factory Store', 'company_premises', '456 Ind Area', 'Pune', 'Maharashtra', '411001'),
                ('Port Warehouse', 'customs_warehouse', '789 Port Rd', 'Chennai', 'Tamil Nadu', '600001')
            ]
            
            for name, ltype, addr, city, state, pin in locs:
                cursor.execute(f"SELECT id FROM inventory_master_location WHERE name='{name}' AND tenant_id='{tenant_id}'")
                if not cursor.fetchone():
                    cursor.execute(f"""
                        INSERT INTO inventory_master_location 
                        (tenant_id, name, location_type, address_line1, city, state, country, pincode, created_at, updated_at)
                        VALUES 
                        ('{tenant_id}', '{name}', '{ltype}', '{addr}', '{city}', '{state}', 'India', '{pin}', NOW(), NOW())
                    """)
                    print(f"Seeded: {name}")

    print("Done.")

if __name__ == '__main__':
    fix_location()
