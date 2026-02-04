
import os
import django
import random
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def fix_vendor_final():
    print("Fixing Vendor Portal (Final)...")
    
    with connection.cursor() as cursor:
        tenant_id = None
        cursor.execute("SELECT id FROM tenants LIMIT 1")
        row = cursor.fetchone()
        if not row:
             cursor.execute("SELECT tenant_id FROM users LIMIT 1")
             row = cursor.fetchone()
        if row: tenant_id = row[0]
    
        if not tenant_id:
            print("No tenant found.")
            return

        # 1. Drop incorrect tables if they exist
        tables = [
            'vendor_master_banking',
            'vendor_master_tds',
            'vendor_master_terms',
            'vendor_master_productservices',
            'vendor_master_posettings' # Added this too
        ]

        
        print("Dropping potentially incorrect tables...")
        cursor.execute("SET FOREIGN_KEY_CHECKS=0")
        for t in tables:
            cursor.execute(f"DROP TABLE IF EXISTS {t}")
        cursor.execute("SET FOREIGN_KEY_CHECKS=1")

        # 2. Recreate Tables with CORRECT Schema (based on models.py)
        
        # A. Banking
        print("Creating vendor_master_banking...")
        cursor.execute("""
            CREATE TABLE `vendor_master_banking` (
              `id` bigint NOT NULL AUTO_INCREMENT,
              `tenant_id` varchar(36) NOT NULL,
              `vendor_basic_detail_id` bigint DEFAULT NULL,
              `bank_name` varchar(200) NOT NULL,
              `bank_account_no` varchar(50) NOT NULL,
              `ifsc_code` varchar(11) NOT NULL,
              `branch_name` varchar(200) DEFAULT NULL,
              `swift_code` varchar(11) DEFAULT NULL,
              `vendor_branch` varchar(200) DEFAULT NULL,
              `account_type` varchar(20) NOT NULL DEFAULT 'current',
              `is_active` tinyint(1) NOT NULL DEFAULT '1',
              `created_at` datetime(6) NOT NULL,
              `updated_at` datetime(6) NOT NULL,
              `created_by` varchar(100) DEFAULT NULL,
              `updated_by` varchar(100) DEFAULT NULL,
              PRIMARY KEY (`id`),
              KEY `vendor_master_banking_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`),
              KEY `vendor_master_banking_tenant_idx` (`tenant_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """)

        # B. TDS
        print("Creating vendor_master_tds...")
        cursor.execute("""
            CREATE TABLE `vendor_master_tds` (
              `id` bigint NOT NULL AUTO_INCREMENT,
              `tenant_id` varchar(36) NOT NULL,
              `vendor_basic_detail_id` bigint DEFAULT NULL,
              `tds_section_applicable` varchar(100) DEFAULT NULL,
              `enable_automatic_tds_posting` tinyint(1) NOT NULL DEFAULT '0',
              `msme_udyam_no` varchar(50) DEFAULT NULL,
              `fssai_license_no` varchar(50) DEFAULT NULL,
              `import_export_code` varchar(50) DEFAULT NULL,
              `eou_status` varchar(100) DEFAULT NULL,
              `msme_file` varchar(100) DEFAULT NULL,
              `fssai_file` varchar(100) DEFAULT NULL,
              `import_export_file` varchar(100) DEFAULT NULL,
              `eou_file` varchar(100) DEFAULT NULL,
              `is_active` tinyint(1) NOT NULL DEFAULT '1',
              `created_at` datetime(6) NOT NULL,
              `updated_at` datetime(6) NOT NULL,
              `created_by` varchar(100) DEFAULT NULL,
              `updated_by` varchar(100) DEFAULT NULL,
              PRIMARY KEY (`id`),
              KEY `vendor_master_tds_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """)

        # C. Terms
        print("Creating vendor_master_terms...")
        cursor.execute("""
            CREATE TABLE `vendor_master_terms` (
              `id` bigint NOT NULL AUTO_INCREMENT,
              `tenant_id` varchar(36) NOT NULL,
              `vendor_basic_detail_id` bigint DEFAULT NULL,
              `credit_limit` decimal(15,2) DEFAULT NULL,
              `credit_period` varchar(100) DEFAULT NULL,
              `credit_terms` longtext,
              `penalty_terms` longtext,
              `delivery_terms` longtext,
              `warranty_guarantee_details` longtext,
              `force_majeure` longtext,
              `dispute_redressal_terms` longtext,
              `is_active` tinyint(1) NOT NULL DEFAULT '1',
              `created_at` datetime(6) NOT NULL,
              `updated_at` datetime(6) NOT NULL,
              `created_by` varchar(100) DEFAULT NULL,
              `updated_by` varchar(100) DEFAULT NULL,
              PRIMARY KEY (`id`),
              KEY `vendor_master_terms_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """)
        
        # D. Product Services
        print("Creating vendor_master_productservices...")
        cursor.execute("""
            CREATE TABLE `vendor_master_productservices` (
              `id` bigint NOT NULL AUTO_INCREMENT,
              `tenant_id` varchar(36) NOT NULL,
              `vendor_basic_detail_id` bigint DEFAULT NULL,
              `hsn_sac_code` varchar(20) DEFAULT NULL,
              `item_code` varchar(50) DEFAULT NULL,
              `item_name` varchar(200) NOT NULL,
              `supplier_item_code` varchar(50) DEFAULT NULL,
              `supplier_item_name` varchar(200) DEFAULT NULL,
              `is_active` tinyint(1) NOT NULL DEFAULT '1',
              `created_at` datetime(6) NOT NULL,
              `updated_at` datetime(6) NOT NULL,
              `created_by` varchar(100) DEFAULT NULL,
              `updated_by` varchar(100) DEFAULT NULL,
              PRIMARY KEY (`id`),
              KEY `vendor_master_ps_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """)
        
        # E. PO Settings (Restore if missing)
        print("Creating vendor_master_posettings...")
        cursor.execute("""
            CREATE TABLE `vendor_master_posettings` (
                `id` bigint NOT NULL AUTO_INCREMENT,
                `tenant_id` varchar(36) NOT NULL,
                `name` varchar(200) NOT NULL,
                `category_id` bigint DEFAULT NULL,
                `prefix` varchar(50) DEFAULT NULL,
                `suffix` varchar(50) DEFAULT NULL,
                `digits` int NOT NULL DEFAULT '4',
                `auto_year` tinyint(1) NOT NULL DEFAULT '0',
                `current_number` int NOT NULL DEFAULT '1',
                `is_active` tinyint(1) NOT NULL DEFAULT '1',
                `created_at` datetime(6) NOT NULL,
                `updated_at` datetime(6) NOT NULL,
                PRIMARY KEY (`id`),
                KEY `vendor_master_posettings_tenant_idx` (`tenant_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """)

        # 3. Seed Data
        print("\n--- Seeding Data ---")
        
        # Fetch Vendors
        # Handle dynamic column detection for vendor_master_basicdetail just in case
        cursor.execute("DESCRIBE vendor_master_basicdetail")
        vcols = [c[0] for c in cursor.fetchall()]
        vid_col = 'id' if 'id' in vcols else vcols[0]
        vname_col = 'vendor_name' if 'vendor_name' in vcols else 'name'
        
        cursor.execute(f"SELECT {vid_col}, {vname_col} FROM vendor_master_basicdetail WHERE tenant_id='{tenant_id}'")
        vendors = cursor.fetchall()
        
        for vid, vname in vendors:
            print(f"Seeding for {vname}...")
            
            # Banking
            cursor.execute(f"""
                INSERT INTO vendor_master_banking 
                (tenant_id, vendor_basic_detail_id, bank_name, bank_account_no, ifsc_code, branch_name, created_at, updated_at)
                VALUES 
                ('{tenant_id}', {vid}, 'HDFC Bank', '501{random.randint(100000,999999)}', 'HDFC0001234', 'Mumbai Branch', NOW(), NOW())
            """)
            
            # TDS
            cursor.execute(f"""
                INSERT INTO vendor_master_tds
                (tenant_id, vendor_basic_detail_id, tds_section_applicable, created_at, updated_at)
                VALUES
                ('{tenant_id}', {vid}, '194C', NOW(), NOW())
            """)
            

            # Terms
            cursor.execute(f"""
                INSERT INTO vendor_master_terms
                (tenant_id, vendor_basic_detail_id, credit_period, created_at, updated_at)
                VALUES
                ('{tenant_id}', {vid}, '30 Days', NOW(), NOW())
            """)
            
            # Products
            cursor.execute(f"""
                INSERT INTO vendor_master_productservices
                (tenant_id, vendor_basic_detail_id, item_name, hsn_sac_code, created_at, updated_at)
                VALUES
                ('{tenant_id}', {vid}, 'Consulting Service', '998311', NOW(), NOW())
            """)
            
        # Seed PO Settings
        cursor.execute(f"SELECT id FROM vendor_master_posettings WHERE name='Default PO Series'")
        if not cursor.fetchone():
            cursor.execute(f"""
                INSERT INTO vendor_master_posettings
                (tenant_id, name, prefix, suffix, digits, current_number, created_at, updated_at)
                VALUES
                ('{tenant_id}', 'Default PO Series', 'PO/', '/2025', 4, 1, NOW(), NOW())
            """)
            print("Seeded PO Settings")
            
    print("Done.")

if __name__ == '__main__':
    fix_vendor_final()
