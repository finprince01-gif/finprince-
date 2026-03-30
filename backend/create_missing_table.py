import os
import django
from django.db import connection

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

query = """
CREATE TABLE `vendor_master_vendorcreation_productservices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
  `items` json NOT NULL COMMENT 'JSON array of product/service items; empty array [] when none added',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this record is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL COMMENT 'Created by user',
  `updated_by` varchar(100) DEFAULT NULL COMMENT 'Updated by user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `vendor_prodserv_vendor_unique` (`vendor_basic_detail_id`),
  KEY `vendor_prodserv_tenant_id_idx` (`tenant_id`),
  CONSTRAINT `vendor_prodserv_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

try:
    with connection.cursor() as cursor:
        cursor.execute(query)
    print("Table `vendor_master_vendorcreation_productservices` created successfully.")
except Exception as e:
    print(f"Error: {e}")
