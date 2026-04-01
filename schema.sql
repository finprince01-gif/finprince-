-- AI Accounting Schema
-- Normalized Receipt Voucher Structure

DROP TABLE IF EXISTS `receipt_voucher_items`;
DROP TABLE IF EXISTS `receipt_vouchers`;

CREATE TABLE `receipt_vouchers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `date` date NOT NULL,
  `voucher_number` varchar(100) NOT NULL,
  `voucher_type` varchar(100) DEFAULT NULL,
  `receive_in_ledger_id` bigint NOT NULL,
  `total_amount` decimal(15,2) DEFAULT '0.00',
  `notes` text,
  `source` varchar(100) DEFAULT 'manual',
  `bank_reconciled` tinyint(1) DEFAULT '0',
  `bank_reconcile_date` date DEFAULT NULL,
  `bank_statement_id` bigint DEFAULT NULL,
  `bank_reference_number` varchar(100) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
   PRIMARY KEY (`id`),
   -- UNIQUE KEY `uk_receipt_number` (`tenant_id`,`voucher_number`), -- Removed to allow duplicates per user request
   KEY `fk_receipt_receive_in` (`receive_in_ledger_id`),
  CONSTRAINT `fk_receipt_receive_in` FOREIGN KEY (`receive_in_ledger_id`) REFERENCES `ledger_master` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `receipt_voucher_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `voucher_id` bigint NOT NULL,
  `customer_ledger_id` bigint NOT NULL,
  `reference_id` varchar(100) DEFAULT NULL,
  `reference_type` varchar(50) DEFAULT 'invoice',
  `pending_transaction` json DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT '0.00',
  `pending_before` decimal(15,2) DEFAULT '0.00',
  `received_amount` decimal(15,2) DEFAULT '0.00',
  `balance_after` decimal(15,2) DEFAULT '0.00',
  `is_advance` tinyint(1) DEFAULT '0',
  `advance_ref_no` varchar(100) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `fk_receipt_item_voucher` (`voucher_id`),
  KEY `fk_receipt_item_customer` (`customer_ledger_id`),
  CONSTRAINT `fk_receipt_item_voucher` FOREIGN KEY (`voucher_id`) REFERENCES `receipt_vouchers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_receipt_item_customer` FOREIGN KEY (`customer_ledger_id`) REFERENCES `ledger_master` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


ALTER TABLE `receipt_vouchers`
ADD COLUMN `receive_in_ledger_id` bigint NULL AFTER `voucher_type`,
ADD COLUMN `customer_ledger_id` bigint NULL AFTER `receive_in_ledger_id`;

CREATE TABLE `inventory_operation_outward` ( 
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `outward_slip_no` varchar(100) NOT NULL,
  `issue_slip_series` varchar(100) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `outward_type` varchar(50) NOT NULL DEFAULT 'sales',
  `location_id` bigint DEFAULT NULL,
  `sales_order_no` varchar(500) DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `supplier_invoice_no` varchar(100) DEFAULT NULL,
  `vendor_name` varchar(255) DEFAULT NULL,
  `branch` varchar(100) DEFAULT NULL,
  `address` text,
  `gstin` varchar(20) DEFAULT NULL,
  `total_boxes` varchar(50) DEFAULT NULL,
  `posting_note` text,
  `reasons_for_return` text,
  `items` json DEFAULT NULL,
  `delivery_challan` json DEFAULT NULL,
  `eway_bill_details` json DEFAULT NULL,
  `customer_id` bigint DEFAULT NULL,
  `status` varchar(20) DEFAULT 'PENDING',
  `linked_sales_voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_outward_voucher` (`linked_sales_voucher_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `inventory_operation_consumption` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issue_slip_series` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `goods_from_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `consumption_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fixed_asset_ledger` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expense_ledger` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_note` text COLLATE utf8mb4_unicode_ci,
  `items` json DEFAULT NULL,
  `delivery_challan` json DEFAULT NULL,
  `eway_bill_details` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ioc_tenant` (`tenant_id`),
  KEY `idx_ioc_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

