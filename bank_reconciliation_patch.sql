-- ============================================================
-- Bank Reconciliation Schema Patch
-- Run these ALTER statements if the tables already exist and 
-- were created from the OLD schema (without matched_voucher_id,
-- reconciliation_date, reconciliation_status).
-- ============================================================

-- 1. Add matching engine columns to bank_statement_transactions
ALTER TABLE `bank_statement_transactions`
  ADD COLUMN IF NOT EXISTS `matched_voucher_id` bigint DEFAULT NULL 
    COMMENT 'FK to vouchers.id when matched'
    AFTER `reference_number`,
  ADD COLUMN IF NOT EXISTS `confidence_score` int DEFAULT 0 
    COMMENT 'Match confidence score (0-100)'
    AFTER `matched_voucher_id`,
  ADD COLUMN IF NOT EXISTS `multi_voucher_ids` json DEFAULT NULL 
    COMMENT 'JSON array of voucher IDs for multi-match'
    AFTER `confidence_score`,
  ADD COLUMN IF NOT EXISTS `suggested_party` varchar(255) DEFAULT NULL 
    COMMENT 'Extracted party name'
    AFTER `multi_voucher_ids`,
  ADD COLUMN IF NOT EXISTS `suggested_invoice` varchar(100) DEFAULT NULL 
    COMMENT 'Extracted invoice number'
    AFTER `suggested_party`,
  ADD COLUMN IF NOT EXISTS `suggested_voucher_type` varchar(20) DEFAULT NULL 
    COMMENT 'Suggested payment/receipt'
    AFTER `suggested_invoice`,
  MODIFY COLUMN `match_status` varchar(20) NOT NULL DEFAULT 'Unmatched'
    COMMENT 'Matched | Possible Match | Unmatched | Ignored';

-- 2. Add composite indexes for performance
ALTER TABLE `bank_statement_transactions`
  ADD INDEX IF NOT EXISTS `idx_bank_st_tenant_ledger_status`
    (`tenant_id`, `bank_ledger_id`, `match_status`),
  ADD INDEX IF NOT EXISTS `idx_bank_st_tenant_date`
    (`tenant_id`, `transaction_date`);

-- 3. Add reconciliation columns to bank_reconciliation_links
ALTER TABLE `bank_reconciliation_links`
  ADD COLUMN IF NOT EXISTS `reconciliation_date` date DEFAULT NULL
    COMMENT 'Date when reconciled'
    AFTER `voucher_id`,
  ADD COLUMN IF NOT EXISTS `reconciliation_status` varchar(20) NOT NULL DEFAULT 'Reconciled'
    COMMENT 'Reconciled | Pending | Disputed'
    AFTER `reconciliation_date`,
  ADD COLUMN IF NOT EXISTS `updated_at` datetime(6) NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
    AFTER `created_at`,
  MODIFY COLUMN `reconciliation_type` varchar(50) NOT NULL DEFAULT 'manual'
    COMMENT 'automatic | manual',
  ADD INDEX IF NOT EXISTS `idx_bank_rec_voucher` (`voucher_id`);

-- Verify:
-- SELECT * FROM bank_statement_transactions LIMIT 1;
-- SELECT * FROM bank_reconciliation_links LIMIT 1;
