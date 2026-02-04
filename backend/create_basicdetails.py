
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()



try:
    with connection.cursor() as cursor:
        # Check gstdetails FK requirement
        cursor.execute("DESCRIBE customer_master_customer_gstdetails")
        cols = cursor.fetchall()
        # Find customer_basic_detail_id
        fk_type = "UNKNOWN"
        for col in cols:
            if col[0] == 'customer_basic_detail_id':
                fk_type = col[1]
                break
        
        print(f"gstdetails expects customer_basic_detail_id to be: {fk_type}")

        # Now Create basicdetails
        # We assume id should match fk_type. 
        # If fk_type is bigint(20), we use bigint. If int, we use int.
        
        id_def = "bigint NOT NULL AUTO_INCREMENT"
        if "bigint" in fk_type.lower():
            id_def = "bigint NOT NULL AUTO_INCREMENT"
        elif "int" in fk_type.lower():
            id_def = "int NOT NULL AUTO_INCREMENT"
            
        print(f"Defining ID as: {id_def}")

        sql = f"""
        CREATE TABLE `customer_master_customer_basicdetails` (
          `id` {id_def},
          `tenant_id` varchar(36) NOT NULL,
          `customer_code` varchar(50) NOT NULL,
          `customer_name` varchar(255) NOT NULL,
          `customer_category_id` int DEFAULT NULL,
          `pan_number` varchar(10) DEFAULT NULL,
          `contact_person` varchar(255) DEFAULT NULL,
          `email_address` varchar(254) DEFAULT NULL,
          `contact_number` varchar(15) DEFAULT NULL,
          `is_also_vendor` tinyint(1) NOT NULL DEFAULT '0',
          `is_active` tinyint(1) NOT NULL DEFAULT '1',
          `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
          `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          `created_by` varchar(100) DEFAULT NULL,
          `updated_by` varchar(100) DEFAULT NULL,
          PRIMARY KEY (`id`),
          UNIQUE KEY `customer_basic_tenant_code_uniq` (`tenant_id`,`customer_code`),
          KEY `customer_basic_tenant_id_idx` (`tenant_id`),
          KEY `customer_basic_category_idx` (`customer_category_id`),
          CONSTRAINT `customer_basic_category_fk` FOREIGN KEY (`customer_category_id`) REFERENCES `customer_master_category` (`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """
        
        cursor.execute("SET FOREIGN_KEY_CHECKS=0;")
        cursor.execute(sql)
        cursor.execute("SET FOREIGN_KEY_CHECKS=1;")
    print("SUCCESS: Table basicdetails created.")
except Exception as e:
    print(f"ERROR: {e}")
