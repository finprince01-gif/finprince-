-- Migration to add voucher columns to journal_entries for easier reporting
ALTER TABLE `journal_entries` 
ADD COLUMN `voucher_number` VARCHAR(50) DEFAULT NULL AFTER `voucher_id`,
ADD COLUMN `transaction_date` DATE DEFAULT NULL AFTER `voucher_number`,
ADD COLUMN `narration` TEXT DEFAULT NULL AFTER `transaction_date`,
ADD COLUMN `ledger_name` VARCHAR(255) DEFAULT NULL AFTER `ledger_id`;

-- Update existing entries from vouchers table (if any)
UPDATE `journal_entries` je
JOIN `vouchers` v ON je.voucher_id = v.id
SET je.voucher_number = v.voucher_number,
    je.transaction_date = v.date,
    je.narration = v.narration;
