-- Migration Script: Remove customer_uom column from customer_master_customer_productservice table
-- Date: 2026-02-13
-- Description: Removes the customer_uom column as it was removed from the frontend

USE accounting_db;

-- Check if the column exists before dropping it
ALTER TABLE `customer_master_customer_productservice` 
DROP COLUMN IF EXISTS `customer_uom`;

-- Verify the change
DESCRIBE `customer_master_customer_productservice`;
