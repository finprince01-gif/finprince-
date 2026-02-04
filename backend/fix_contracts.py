
import os
import django
import random
from datetime import date, timedelta
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def fix_contracts():
    print("Fixing Long-term Contracts...")
    
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

        # 1. Create Tables
        print("Creating tables...")
        

        # A. Basic Details
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS `customer_master_longtermcontracts_basicdetails` (
              `id` bigint NOT NULL AUTO_INCREMENT,
              `tenant_id` varchar(36) NOT NULL,
              `contract_number` varchar(50) NOT NULL,
              `customer_id` int NOT NULL,
              `customer_name` varchar(255) NOT NULL,
              `branch_id` int DEFAULT NULL,
              `contract_type` varchar(50) NOT NULL,
              `contract_validity_from` date NOT NULL,
              `contract_validity_to` date NOT NULL,
              `contract_document` varchar(500) DEFAULT NULL,
              `automate_billing` tinyint(1) NOT NULL DEFAULT '0',
              `bill_start_date` date DEFAULT NULL,
              `billing_frequency` varchar(20) DEFAULT NULL,
              `voucher_name` varchar(100) DEFAULT NULL,
              `bill_period_from` date DEFAULT NULL,
              `bill_period_to` date DEFAULT NULL,
              `is_active` tinyint(1) NOT NULL DEFAULT '1',
              `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
              `created_at` datetime(6) NOT NULL,
              `updated_at` datetime(6) NOT NULL,
              `created_by` varchar(100) DEFAULT NULL,
              PRIMARY KEY (`id`),
              UNIQUE KEY `uniq_cm_ltc_bd_tid_cn` (`tenant_id`,`contract_number`),
              KEY `idx_cm_ltc_bd_tid_cid` (`tenant_id`,`customer_id`),
              KEY `idx_cm_ltc_bd_validity` (`contract_validity_from`,`contract_validity_to`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """)
        
        # B. Product/Services
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS `customer_master_longtermcontracts_productservices` (
              `id` bigint NOT NULL AUTO_INCREMENT,
              `tenant_id` varchar(36) NOT NULL,
              `contract_basic_detail_id` bigint NOT NULL,
              `item_code` varchar(50) NOT NULL,
              `item_name` varchar(200) NOT NULL,
              `customer_item_name` varchar(200) DEFAULT NULL,
              `qty_min` decimal(15,2) DEFAULT NULL,
              `qty_max` decimal(15,2) DEFAULT NULL,
              `price_min` decimal(15,2) DEFAULT NULL,
              `price_max` decimal(15,2) DEFAULT NULL,
              `acceptable_price_deviation` varchar(50) DEFAULT NULL,
              `created_at` datetime(6) NOT NULL,
              `updated_at` datetime(6) NOT NULL,
              `created_by` varchar(100) DEFAULT NULL,
              PRIMARY KEY (`id`),
              KEY `idx_cm_ltc_ps_cbid` (`contract_basic_detail_id`),
              KEY `idx_cm_ltc_ps_tid_ic` (`tenant_id`,`item_code`),
              CONSTRAINT `fk_cm_ltc_ps_bd` FOREIGN KEY (`contract_basic_detail_id`) REFERENCES `customer_master_longtermcontracts_basicdetails` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """)

        # C. Terms & Conditions
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS `customer_master_longtermcontracts_termscondition` (
              `id` bigint NOT NULL AUTO_INCREMENT,
              `tenant_id` varchar(36) NOT NULL,
              `contract_basic_detail_id` bigint NOT NULL,
              `payment_terms` longtext,
              `penalty_terms` longtext,
              `force_majeure` longtext,
              `termination_clause` longtext,
              `dispute_terms` longtext,
              `others` longtext,
              `created_at` datetime(6) NOT NULL,
              `updated_at` datetime(6) NOT NULL,
              `created_by` varchar(100) DEFAULT NULL,
              PRIMARY KEY (`id`),
              UNIQUE KEY `uniq_cm_ltc_tc_cbid` (`contract_basic_detail_id`),
              CONSTRAINT `fk_cm_ltc_tc_bd` FOREIGN KEY (`contract_basic_detail_id`) REFERENCES `customer_master_longtermcontracts_basicdetails` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """)

        # 2. Seed Data
        print("Seeding contracts...")
        
        # Get a customer's basic detail
        # We need `id` (Customer basic detail ID) which is often used as `customer_id` in other tables
        # But wait, `customer_id` in `CustomerMasterLongTermContractBasicDetail` is an IntegerField, 
        # usually referencing `CustomerMasterCustomerBasicDetails.id` or `CustomerMaster.id`.
        # Taking a look at `CustomerMasterCustomerBasicDetails`:
        cursor.execute(f"SELECT id, customer_name FROM customer_master_customer_basicdetails WHERE tenant_id='{tenant_id}' LIMIT 1")
        cust = cursor.fetchone()
        
        if not cust:
            print("No customers found. Please seed customers first.")
            # Fallback to create dummy or skip
            return

        cust_id, cust_name = cust
        contract_no = f"CON-{random.randint(1000,9999)}"
        
        cursor.execute(f"SELECT id FROM customer_master_longtermcontracts_basicdetails WHERE contract_number='{contract_no}'")
        if not cursor.fetchone():
            # Insert Basic Detail
            sql = f"""
                INSERT INTO customer_master_longtermcontracts_basicdetails
                (tenant_id, contract_number, customer_id, customer_name, contract_type, contract_validity_from, contract_validity_to, is_active, created_at, updated_at)
                VALUES
                ('{tenant_id}', '{contract_no}', {cust_id}, '{cust_name}', 'Service Contract', NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 1, NOW(), NOW())
            """
            cursor.execute(sql)
            contract_id = cursor.lastrowid
            print(f"Created Contract {contract_no} for {cust_name}")
            
            # Insert Product
            sql_prod = f"""
                INSERT INTO customer_master_longtermcontracts_productservices
                (tenant_id, contract_basic_detail_id, item_code, item_name, price_min, price_max, created_at, updated_at)
                VALUES
                ('{tenant_id}', {contract_id}, 'SERV001', 'Annual Maintenance', 10000.00, 12000.00, NOW(), NOW())
            """
            cursor.execute(sql_prod)
            
            # Insert Terms
            sql_terms = f"""
                INSERT INTO customer_master_longtermcontracts_termscondition
                (tenant_id, contract_basic_detail_id, payment_terms, created_at, updated_at)
                VALUES
                ('{tenant_id}', {contract_id}, 'Net 30 Days', NOW(), NOW())
            """
            cursor.execute(sql_terms)
            
    print("Done.")

if __name__ == '__main__':
    fix_contracts()
