-- Fix missing columns in existing vouchers table
ALTER TABLE `vouchers` ADD COLUMN `party` VARCHAR(255) DEFAULT NULL;
ALTER TABLE `vouchers` ADD COLUMN `account` VARCHAR(255) DEFAULT NULL;
ALTER TABLE `vouchers` ADD COLUMN `amount` DECIMAL(15,2) DEFAULT NULL;
ALTER TABLE `vouchers` ADD COLUMN `total` DECIMAL(15,2) DEFAULT 0.00;
ALTER TABLE `vouchers` ADD COLUMN `narration` TEXT DEFAULT NULL;
ALTER TABLE `vouchers` ADD COLUMN `source` VARCHAR(100) DEFAULT 'manual';
ALTER TABLE `vouchers` ADD COLUMN `invoice_no` VARCHAR(50) DEFAULT NULL;
ALTER TABLE `vouchers` ADD COLUMN `reference_id` BIGINT DEFAULT NULL;

-- Fix missing column in sales invoice details
ALTER TABLE `voucher_sales_invoicedetails` ADD COLUMN `voucher_id` BIGINT DEFAULT NULL;
