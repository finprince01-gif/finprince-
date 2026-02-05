-- Drop the old inventory_operation_grn table
-- This table has been replaced by inventory_operation_new_grn

-- Check if table exists before dropping
DROP TABLE IF EXISTS `inventory_operation_grn`;

-- Verify the table is dropped
SHOW TABLES LIKE 'inventory_operation_grn';
