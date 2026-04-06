import re

file_path = 'd:\\inventory0.19\\AI-accounting-0.03\\schema.sql'

with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Define the new table structure
new_table = """CREATE TABLE `inventory_operation_production` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `issue_slip_series` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `goods_from_location` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `goods_to_location` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `production_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'materials_issued' COMMENT 'materials_issued, inter_process, finished_goods',
  `material_issue_slip_no` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `process_transfer_slip_no` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `finished_goods_production_no` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `batch_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `items` json DEFAULT NULL COMMENT 'List of items with type (input/output/waste), quantity, rate, etc.',
  `delivery_challan` json DEFAULT NULL,
  `eway_bill_details` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_iop_tenant` (`tenant_id`),
  KEY `idx_iop_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"""

# Replace the existing table with the new table
new_text = re.sub(r'CREATE TABLE `inventory_operation_production`[\s\S]*?\) ENGINE=InnoDB[^;]*;', new_table, text, flags=re.IGNORECASE)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_text)

print("Schema file updated.")
