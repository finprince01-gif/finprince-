-- STEP 3: Fix Staging Table
RENAME TABLE `bank_statement_transactions` TO `bank_statement_staging`;

ALTER TABLE `bank_statement_staging`
  ADD COLUMN `cheque_number` varchar(100) DEFAULT NULL AFTER `reference_number`,
  ADD COLUMN `running_balance` decimal(15,2) NOT NULL DEFAULT '0.00' AFTER `cheque_number`,
  ADD COLUMN `import_batch_id` varchar(100) DEFAULT NULL AFTER `running_balance`,
  MODIFY COLUMN `match_status` varchar(50) NOT NULL DEFAULT 'UNMATCHED';

-- Update existing statuses to new format
UPDATE `bank_statement_staging` SET `match_status` = 'UNMATCHED' WHERE `match_status` = 'Unmatched';
-- (Add other mappings if needed, but 'Unmatched' covers most)

-- STEP 9: Voucher Table Enhancements
ALTER TABLE `voucher_payment_single`
  ADD COLUMN `bank_reconciled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `bank_reconcile_date` DATE DEFAULT NULL,
  ADD COLUMN `bank_statement_id` bigint DEFAULT NULL,
  ADD COLUMN `bank_reference_number` varchar(100) DEFAULT NULL;

ALTER TABLE `voucher_payment_bulk`
  ADD COLUMN `bank_reconciled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `bank_reconcile_date` DATE DEFAULT NULL,
  ADD COLUMN `bank_statement_id` bigint DEFAULT NULL,
  ADD COLUMN `bank_reference_number` varchar(100) DEFAULT NULL;

ALTER TABLE `voucher_receipt_single`
  ADD COLUMN `bank_reconciled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `bank_reconcile_date` DATE DEFAULT NULL,
  ADD COLUMN `bank_statement_id` bigint DEFAULT NULL,
  ADD COLUMN `bank_reference_number` varchar(100) DEFAULT NULL;

ALTER TABLE `voucher_receipt_bulk`
  ADD COLUMN `bank_reconciled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `bank_reconcile_date` DATE DEFAULT NULL,
  ADD COLUMN `bank_statement_id` bigint DEFAULT NULL,
  ADD COLUMN `bank_reference_number` varchar(100) DEFAULT NULL;

ALTER TABLE `voucher_contra`
  ADD COLUMN `bank_reconciled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `bank_reconcile_date` DATE DEFAULT NULL,
  ADD COLUMN `bank_statement_id` bigint DEFAULT NULL,
  ADD COLUMN `bank_reference_number` varchar(100) DEFAULT NULL;

ALTER TABLE `voucher_journal`
  ADD COLUMN `bank_reconciled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `bank_reconcile_date` DATE DEFAULT NULL,
  ADD COLUMN `bank_statement_id` bigint DEFAULT NULL,
  ADD COLUMN `bank_reference_number` varchar(100) DEFAULT NULL;

-- Update foreign key in reconciliation links
ALTER TABLE `bank_reconciliation_links`
  DROP FOREIGN KEY `fk_bank_rec_transaction`;

ALTER TABLE `bank_reconciliation_links`
  ADD CONSTRAINT `fk_bank_rec_staging` 
  FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_statement_staging` (`id`) ON DELETE CASCADE;
