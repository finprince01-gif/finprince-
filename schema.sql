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
