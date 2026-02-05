-- Check if GRN tables exist
SHOW TABLES LIKE 'inventory_operation%grn%';

-- Check structure of inventory_operation_grn
DESCRIBE inventory_operation_grn;

-- Check structure of inventory_operation_new_grn
DESCRIBE inventory_operation_new_grn;

-- Check if there's any data
SELECT COUNT(*) as grn_count FROM inventory_operation_grn;
SELECT COUNT(*) as new_grn_count FROM inventory_operation_new_grn;
