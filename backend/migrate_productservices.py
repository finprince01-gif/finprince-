"""
Run this script once to migrate the productservices table to the new JSON-array design.
It drops the old table and recreates it with the new schema.
"""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def migrate_table():
    with connection.cursor() as cursor:
        print("Dropping old table...")
        cursor.execute("DROP TABLE IF EXISTS `vendor_master_vendorcreation_productservices`")
        
        print("Creating new table with JSON items column...")
        cursor.execute("""
            CREATE TABLE `vendor_master_vendorcreation_productservices` (
              `id` bigint NOT NULL AUTO_INCREMENT,
              `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
              `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'FK to vendor_master_vendorcreation_basicdetail',
              `items` JSON NOT NULL COMMENT 'JSON array of product/service items',
              `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Whether this record is active',
              `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
              `created_by` varchar(100) DEFAULT NULL,
              `updated_by` varchar(100) DEFAULT NULL,
              PRIMARY KEY (`id`),
              UNIQUE KEY `vendor_prodserv_vendor_unique` (`vendor_basic_detail_id`),
              KEY `vendor_prodserv_tenant_id_idx` (`tenant_id`),
              CONSTRAINT `vendor_prodserv_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`)
                REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
              COMMENT='Vendor Master Products/Services (JSON array per vendor)'
        """)
        print("Table created successfully.")

        # Verify
        cursor.execute("DESCRIBE `vendor_master_vendorcreation_productservices`")
        cols = cursor.fetchall()
        print("New table columns:")
        for col in cols:
            print(f"  {col[0]:25s} {col[1]}")

migrate_table()
print("\nDone.")
