import mysql.connector

def final_schema_fix():
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="Dha10903@",
            database="ai_accounting"
        )
        cursor = conn.cursor()

        # 1. Add missing columns
        for table in ['inventory_operation_jobwork', 'inventory_operation_production']:
            print(f"Checking {table} for issue_slip_series...")
            cursor.execute(f"DESCRIBE `{table}`")
            cols = {row[0] for row in cursor.fetchall()}
            if 'issue_slip_series' not in cols:
                print(f"Adding issue_slip_series to {table}")
                cursor.execute(f"ALTER TABLE `{table}` ADD COLUMN `issue_slip_series` VARCHAR(100) NULL")
                conn.commit()

        # 2. Create missing tables
        print("Creating missing stock tables...")
        
        # inventory_stock_groups
        cursor.execute("SHOW TABLES LIKE 'inventory_stock_groups'")
        if not cursor.fetchone():
            print("Creating inventory_stock_groups")
            cursor.execute("""
                CREATE TABLE `inventory_stock_groups` (
                    `id` bigint NOT NULL AUTO_INCREMENT,
                    `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                    `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `description` text COLLATE utf8mb4_unicode_ci,
                    `parent_id` bigint DEFAULT NULL,
                    PRIMARY KEY (`id`),
                    UNIQUE KEY `inventory_stock_groups_tenant_id_name_uniq` (`tenant_id`, `name`),
                    KEY `inventory_stock_groups_parent_id_fk` (`parent_id`),
                    CONSTRAINT `inventory_stock_groups_parent_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `inventory_stock_groups` (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)
            conn.commit()

        # inventory_stock_items
        cursor.execute("SHOW TABLES LIKE 'inventory_stock_items'")
        if not cursor.fetchone():
            print("Creating inventory_stock_items")
            cursor.execute("""
                CREATE TABLE `inventory_stock_items` (
                    `id` bigint NOT NULL AUTO_INCREMENT,
                    `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                    `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `item_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `hsn_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                    `group` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                    `unit` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'nos',
                    `current_balance` decimal(15,3) NOT NULL DEFAULT '0.000',
                    `rate` decimal(15,2) NOT NULL DEFAULT '0.00',
                    `is_active` tinyint(1) NOT NULL DEFAULT '1',
                    PRIMARY KEY (`id`),
                    UNIQUE KEY `inventory_stock_items_tenant_id_item_code_uniq` (`tenant_id`, `item_code`),
                    KEY `idx_stock_items_tenant` (`tenant_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)
            conn.commit()

        # inventory_stock_movements
        cursor.execute("SHOW TABLES LIKE 'inventory_stock_movements'")
        if not cursor.fetchone():
            print("Creating inventory_stock_movements")
            cursor.execute("""
                CREATE TABLE `inventory_stock_movements` (
                    `id` bigint NOT NULL AUTO_INCREMENT,
                    `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                    `item_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `date` date NOT NULL,
                    `time` time DEFAULT NULL,
                    `voucher_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `voucher_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                    `inward_qty` decimal(15,3) NOT NULL DEFAULT '0.000',
                    `outward_qty` decimal(15,3) NOT NULL DEFAULT '0.000',
                    `balance_qty` decimal(15,3) NOT NULL DEFAULT '0.000',
                    `rate` decimal(15,2) NOT NULL DEFAULT '0.00',
                    `value` decimal(15,2) NOT NULL DEFAULT '0.00',
                    PRIMARY KEY (`id`),
                    KEY `idx_stock_mvmt_tenant_item_date` (`tenant_id`, `item_code`, `date`),
                    KEY `idx_stock_mvmt_tenant_location` (`tenant_id`, `location`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)
            conn.commit()

        print("Final schema fix completed.")

    except mysql.connector.Error as err:
        print(f"Error: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    final_schema_fix()
