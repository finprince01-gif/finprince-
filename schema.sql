  -- create database Finpixe_AI_Accounting;

  -- Table: tenants

  CREATE TABLE `tenants` (
    `id` char(36) NOT NULL,
    `name` varchar(255) NOT NULL,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- Table: ai_usage
  -- Tracks monthly AI invoice extraction usage per tenant for subscription enforcement.

  CREATE TABLE IF NOT EXISTS `ai_usage` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` char(36) NOT NULL,
    `year` int NOT NULL,
    `month` int NOT NULL,
    `used_count` int NOT NULL DEFAULT '0',
    PRIMARY KEY (`id`),
    UNIQUE KEY `ai_usage_tenant_year_month_uniq` (`tenant_id`, `year`, `month`),
    KEY `ai_usage_tenant_id_idx` (`tenant_id`),
    CONSTRAINT `ai_usage_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Monthly AI invoice extraction usage tracker per tenant';

  -- Table: extraction_performance
  -- Stores historical OCR extraction timings for estimating scan duration.

  CREATE TABLE IF NOT EXISTS `extraction_performance` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `file_count` int NOT NULL DEFAULT '1',
    `processing_time_seconds` double NOT NULL,
    `timestamp` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    KEY `extraction_performance_timestamp_idx` (`timestamp`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='OCR extraction performance timings for scan duration estimation';

  -- Table: amount_transactions


  CREATE TABLE `amount_transactions` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL,
    `created_at` datetime(6) DEFAULT NULL,
    `updated_at` datetime(6) DEFAULT NULL,
    `transaction_date` date NOT NULL,
    `transaction_type` varchar(20) NOT NULL DEFAULT 'transaction',
    `debit` decimal(15,2) NOT NULL DEFAULT '0.00',
    `credit` decimal(15,2) NOT NULL DEFAULT '0.00',
    `balance` decimal(15,2) NOT NULL DEFAULT '0.00',
    `narration` longtext,
    `ledger_id` bigint NOT NULL,
    `ledger_name` varchar(255) DEFAULT NULL COMMENT 'Ledger name (e.g., bank2, Cash, HDFC Bank)',
    `sub_group_1` varchar(255) DEFAULT NULL,
    `code` varchar(50) DEFAULT NULL,
    `voucher_id` bigint DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `tenant_id` (`tenant_id`),
    KEY `amount_tran_tenant__d7c201_idx` (`tenant_id`,`ledger_id`,`transaction_date`),
    KEY `amount_tran_tenant__9534d3_idx` (`tenant_id`,`transaction_type`),
    KEY `amount_tran_transac_10f4ee_idx` (`transaction_date`)
  ) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


  -- Table: answers

  CREATE TABLE `answers` (
    `id` int NOT NULL AUTO_INCREMENT,
    `ledger_code` varchar(50) DEFAULT NULL,
    `answer` longtext,
    `tenant_id` varchar(36) DEFAULT NULL,
    `sub_group_1_1` varchar(255) DEFAULT NULL,
    `sub_group_1_2` varchar(255) DEFAULT NULL,
    `question` text,
    PRIMARY KEY (`id`)
  ) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


  -- Table: company_informations
CREATE TABLE `company_informations` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` char(36) NOT NULL,
    `company_name` varchar(255) NOT NULL,
    `address_line1` varchar(255) DEFAULT NULL,
    `address_line2` varchar(255) DEFAULT NULL,
    `city` varchar(100) DEFAULT NULL,
    `state` varchar(100) DEFAULT NULL,
    `pincode` varchar(10) DEFAULT NULL,
    `country` varchar(100) DEFAULT 'India',
    `phone` varchar(15) DEFAULT NULL,
    `mobile` varchar(15) DEFAULT NULL,
    `email` varchar(255) DEFAULT NULL,
    `website` varchar(255) DEFAULT NULL,
    `gstin` varchar(15) DEFAULT NULL,
    `pan` varchar(10) DEFAULT NULL,
    `cin` varchar(21) DEFAULT NULL,
    `tan` varchar(10) DEFAULT NULL,
    `business_type` varchar(50) DEFAULT NULL,
    `industry_type` varchar(100) DEFAULT NULL,
    `financial_year_start` date DEFAULT NULL,
    `financial_year_end` date DEFAULT NULL,
    `logo_path` varchar(500) DEFAULT NULL,
    `signature_path` varchar(500) DEFAULT NULL,
    `bank_name` varchar(255) DEFAULT NULL,
    `bank_account_no` varchar(20) DEFAULT NULL,
    `bank_ifsc` varchar(11) DEFAULT NULL,
    `bank_branch` varchar(255) DEFAULT NULL,
    `voucher_numbering` json DEFAULT NULL,
    `created_at` datetime(6) NOT NULL,
    `updated_at` datetime(6) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `company_informations_tenant_unique` (`tenant_id`),
    CONSTRAINT `company_informations_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;






  -- Table: master_hierarchy_raw

  CREATE TABLE `master_hierarchy_raw` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `type_of_business_1` text,
    `financial_reporting_1` text,
    `major_group_1` text,
    `group_1` text,
    `sub_group_1_1` text,
    `sub_group_2_1` text,
    `sub_group_3_1` text,
    `ledger_1` text,
    `code` text,
    `type_of_business_2` text,
    `financial_reporting_2` text,
    `major_group_2` text,
    `group_2` text,
    `sub_group_1_2` text,
    `sub_group_2_2` text,
    `sub_group_3_2` text,
    `ledger_2` text,
    PRIMARY KEY (`id`)
  ) ENGINE=InnoDB AUTO_INCREMENT=597 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


  -- Table: master_ledgers

  CREATE TABLE `master_ledgers` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` char(36) NOT NULL,
    `name` varchar(255) NOT NULL COMMENT 'Custom ledger name',
    `category` varchar(255) NOT NULL COMMENT 'From hierarchy: major_group_1',
    `group` varchar(255) DEFAULT NULL,
    `sub_group_1` varchar(255) DEFAULT NULL COMMENT 'From hierarchy: sub_group_1_1',
    `sub_group_2` varchar(255) DEFAULT NULL COMMENT 'From hierarchy: sub_group_2_1',
    `sub_group_3` varchar(255) DEFAULT NULL COMMENT 'From hierarchy: sub_group_3_1',
    `ledger_type` varchar(255) DEFAULT NULL COMMENT 'From hierarchy: ledger_1',
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `gstin` varchar(15) DEFAULT NULL,
    `registration_type` varchar(20) DEFAULT NULL,
    `state` varchar(100) DEFAULT NULL,
    `extended_data` json DEFAULT NULL,
    `parent_ledger_id` int DEFAULT NULL,
    `ledger_code` varchar(50) DEFAULT NULL,
    `type_of_business` varchar(255) DEFAULT NULL,
    `financial_reporting` varchar(255) DEFAULT NULL,
    `major_group` varchar(255) DEFAULT NULL,
    `ledger` varchar(255) DEFAULT NULL,
    `additional_data` json DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `master_ledgers_name_tenant_unique` (`name`,`tenant_id`),
    UNIQUE KEY `master_ledgers_ledger_code_tenant_id_ef0135d0_uniq` (`ledger_code`,`tenant_id`),
    KEY `master_ledgers_tenant_id_idx` (`tenant_id`),
    KEY `master_ledgers_category_idx` (`category`),
    KEY `master_ledgers_group_idx` (`group`),
    CONSTRAINT `master_ledgers_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=1004 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



  -- Table: questions

  CREATE TABLE `questions` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `sub_group_1_2` varchar(50) DEFAULT NULL,
    `sub_group_1_1` varchar(255) DEFAULT NULL,
    `question` varchar(500) NOT NULL,
    `condition_rule` varchar(255) DEFAULT NULL,
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_sg1_question` (`sub_group_1_2`,`question`)
  ) ENGINE=InnoDB AUTO_INCREMENT=1071 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;





  -- Table: transcaction_file

  CREATE TABLE `transcaction_file` (
    `id` bigint NOT NULL,
    `tenant_id` bigint NOT NULL,
    `financial_year_id` bigint NOT NULL,
    `ledger_code` varchar(50) DEFAULT NULL,
    `ledger_name` varchar(255) NOT NULL,
    `alias_name` varchar(255) DEFAULT NULL,
    `group_id` bigint DEFAULT NULL,
    `nature` varchar(20) DEFAULT NULL,
    `ledger_type` varchar(50) DEFAULT NULL,
    `is_active` tinyint(1) DEFAULT '1',
    `opening_balance` decimal(18,2) DEFAULT '0.00',
    `opening_balance_type` varchar(10) DEFAULT NULL,
    `current_balance` decimal(18,2) DEFAULT '0.00',
    `current_balance_type` varchar(10) DEFAULT NULL,
    `closing_balance` decimal(18,2) DEFAULT '0.00',
    `closing_balance_type` varchar(10) DEFAULT NULL,
    `bank_name` varchar(255) DEFAULT NULL,
    `branch_name` varchar(255) DEFAULT NULL,
    `account_number` varchar(50) DEFAULT NULL,
    `ifsc_code` varchar(20) DEFAULT NULL,
    `micr_code` varchar(20) DEFAULT NULL,
    `upi_id` varchar(100) DEFAULT NULL,
    `gst_applicable` tinyint(1) DEFAULT '0',
    `gst_registration_type` varchar(50) DEFAULT NULL,
    `gstin` varchar(20) DEFAULT NULL,
    `hsn_sac_code` varchar(20) DEFAULT NULL,
    `gst_rate` decimal(5,2) DEFAULT NULL,
    `cgst_rate` decimal(5,2) DEFAULT NULL,
    `sgst_rate` decimal(5,2) DEFAULT NULL,
    `igst_rate` decimal(5,2) DEFAULT NULL,
    `is_tds_applicable` tinyint(1) DEFAULT '0',
    `tds_section` varchar(20) DEFAULT NULL,
    `tds_rate` decimal(5,2) DEFAULT NULL,
    `contact_person` varchar(255) DEFAULT NULL,
    `mobile` varchar(20) DEFAULT NULL,
    `email` varchar(255) DEFAULT NULL,
    `address_line1` varchar(255) DEFAULT NULL,
    `address_line2` varchar(255) DEFAULT NULL,
    `city` varchar(100) DEFAULT NULL,
    `state` varchar(100) DEFAULT NULL,
    `pincode` varchar(20) DEFAULT NULL,
    `country` varchar(100) DEFAULT NULL,
    `allow_bill_wise` tinyint(1) DEFAULT '0',
    `credit_limit` decimal(18,2) DEFAULT NULL,
    `credit_days` int DEFAULT NULL,
    `is_cost_center_required` tinyint(1) DEFAULT '0',
    `is_inventory_linked` tinyint(1) DEFAULT '0',
    `is_system_ledger` tinyint(1) DEFAULT '0',
    `lock_editing` tinyint(1) DEFAULT '0',
    `created_by` bigint DEFAULT NULL,
    `updated_by` bigint DEFAULT NULL,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ledger_code` (`ledger_code`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


  -- Table: users

  CREATE TABLE `users` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `password` varchar(128) NOT NULL,
    `last_login` datetime(6) DEFAULT NULL,
    `is_superuser` tinyint(1) NOT NULL DEFAULT '0',
    `username` varchar(150) NOT NULL,
    `first_name` varchar(150) DEFAULT NULL,
    `last_name` varchar(150) DEFAULT NULL,
    `email` varchar(254) DEFAULT NULL,
    `is_staff` tinyint(1) NOT NULL DEFAULT '0',
    `is_active` tinyint(1) NOT NULL DEFAULT '1',
    `date_joined` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `phone` varchar(15) DEFAULT NULL,
    `phone_verified` tinyint(1) NOT NULL DEFAULT '0',
    `email_verified` tinyint(1) NOT NULL DEFAULT '0',
    `tenant_id` char(36) NOT NULL,
    `company_name` varchar(255) DEFAULT NULL,
    `state` varchar(100) DEFAULT NULL,
    `selected_plan` varchar(50) DEFAULT NULL,
    `logo_path` varchar(500) DEFAULT NULL,
    `login_status` varchar(20) DEFAULT 'Offline',
    `last_activity` datetime(6) DEFAULT NULL,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    UNIQUE KEY `username` (`username`),
    UNIQUE KEY `email` (`email`),
    KEY `users_tenant_id_idx` (`tenant_id`),
    CONSTRAINT `users_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;




  -- Table: vendor_master_category

  CREATE TABLE `vendor_master_category` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` VARCHAR(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `category` VARCHAR(255) NOT NULL COMMENT 'Top-level category',
    `group` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Group under category',
    `subgroup` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Subgroup under group',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Whether this category is active',
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`id`),

    UNIQUE KEY `vendor_category_tenant_unique`
    (
      `tenant_id`,
      `category`(100),
      `group`(100),
      `subgroup`(100)
    ),

    KEY `vendor_category_tenant_id_idx` (`tenant_id`),
    KEY `vendor_category_is_active_idx` (`tenant_id`, `is_active`),
    KEY `vendor_category_category_idx` (`category`(100))
  )
  ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Vendor Master Category - Stores vendor category hierarchy';


  -- Table: vendor_master_posettings


  CREATE TABLE IF NOT EXISTS `vendor_master_posettings` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `category_id` BIGINT DEFAULT NULL,
    `prefix` VARCHAR(50) DEFAULT NULL,
    `suffix` VARCHAR(50) DEFAULT NULL,
    `digits` INT NOT NULL DEFAULT 4,
    `auto_year` TINYINT(1) NOT NULL DEFAULT 0,
    `current_number` INT NOT NULL DEFAULT 1,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`id`),
    UNIQUE KEY `vendor_posettings_tenant_name_unique` (`tenant_id`,`name`),
    KEY `vendor_posettings_tenant_id_idx` (`tenant_id`),
    CONSTRAINT `vendor_posettings_category_fk` FOREIGN KEY (`category_id`) REFERENCES `vendor_master_category` (`id`) ON DELETE SET NULL
  )
  ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


  -- Table: vendor_master_vendorcreation_basicdetail

  CREATE TABLE `vendor_master_vendorcreation_basicdetail` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `vendor_code` varchar(50) DEFAULT NULL COMMENT 'Vendor code (auto-generated or manual)',
    `vendor_name` varchar(200) NOT NULL COMMENT 'Vendor name',
    `pan_no` varchar(10) DEFAULT NULL COMMENT 'PAN number',
    `contact_person` varchar(100) DEFAULT NULL COMMENT 'Contact person name',
    `email` varchar(255) NOT NULL COMMENT 'Email address',
    `contact_no` varchar(20) NOT NULL COMMENT 'Contact number',
    `vendor_category` varchar(200) DEFAULT NULL COMMENT 'Vendor category',
    `billing_currency` varchar(10) DEFAULT NULL COMMENT 'Billing currency',
    `is_also_customer` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Is this vendor also a customer?',
    `tcs_applicable` tinyint(1) DEFAULT '0' COMMENT 'Is TCS applicable for this vendor?',
    `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this vendor is active',
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL COMMENT 'Created by user',
    `updated_by` varchar(100) DEFAULT NULL COMMENT 'Updated by user',
    PRIMARY KEY (`id`),
    UNIQUE KEY `vendor_basicdetail_tenant_code_unique` (`tenant_id`,`vendor_code`),
    KEY `vendor_basicdetail_tenant_id_idx` (`tenant_id`),
    KEY `vendor_basicdetail_tenant_name_idx` (`tenant_id`,`vendor_name`),
    KEY `vendor_basicdetail_email_idx` (`email`),
    KEY `vendor_basicdetail_pan_idx` (`pan_no`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master Basic Details for vendor creation';


  -- Table: vendor_master_gstdetails

  CREATE TABLE `vendor_master_vendorcreation_gstdetails` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
    `gstin` varchar(15) NOT NULL COMMENT 'GSTIN number (15 characters)',
    `gst_registration_type` varchar(50) NOT NULL DEFAULT 'regular' COMMENT 'GST registration type',
    `legal_name` varchar(200) NOT NULL COMMENT 'Legal name as per GST',
    `trade_name` varchar(200) DEFAULT NULL COMMENT 'Trade/Brand name',
    `gst_state` varchar(100) DEFAULT NULL COMMENT 'State of GST registration',
    `gst_state_code` varchar(2) DEFAULT NULL COMMENT 'State code (2 digits)',
    `pan_linked_with_gstin` varchar(10) DEFAULT NULL COMMENT 'PAN linked with GSTIN',
    `date_of_registration` date DEFAULT NULL COMMENT 'Date of GST registration',
    `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this GST detail is active',
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL COMMENT 'Created by user',
    `updated_by` varchar(100) DEFAULT NULL COMMENT 'Updated by user',
    `reference_name` varchar(200) DEFAULT NULL COMMENT 'Branch reference name',
    `branch_address` longtext DEFAULT NULL COMMENT 'Branch address',
    `branch_contact_person` varchar(100) DEFAULT NULL COMMENT 'Branch contact person',
    `branch_email` varchar(255) DEFAULT NULL COMMENT 'Branch email',
    `branch_contact_no` varchar(20) DEFAULT NULL COMMENT 'Branch contact number',
    PRIMARY KEY (`id`),
    UNIQUE KEY `vendor_gstdetails_tenant_gstin_ref_unique` (`tenant_id`,`gstin`,`reference_name`),
    KEY `vendor_gstdetails_tenant_id_idx` (`tenant_id`),
    KEY `vendor_gstdetails_gstin_idx` (`gstin`),
    KEY `vendor_gstdetails_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`),
    CONSTRAINT `vendor_gstdetails_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master GST Details';


  -- Table: vendor_master_vendorcreation_productservices
  -- Stores all product/service items as a JSON array per vendor (one row per vendor)

  CREATE TABLE `vendor_master_vendorcreation_productservices` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
    `items` JSON NOT NULL DEFAULT (JSON_ARRAY()) COMMENT 'JSON array of product/service items; empty array [] when none added',
    `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this record is active',
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL COMMENT 'Created by user',
    `updated_by` varchar(100) DEFAULT NULL COMMENT 'Updated by user',
    PRIMARY KEY (`id`),
    UNIQUE KEY `vendor_prodserv_vendor_unique` (`vendor_basic_detail_id`),
    KEY `vendor_prodserv_tenant_id_idx` (`tenant_id`),
    CONSTRAINT `vendor_prodserv_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master Products/Services (JSON array per vendor)';




  -- Table: vendor_master_tds

  CREATE TABLE `vendor_master_vendorcreation_tds` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
    `pan_number` varchar(10) DEFAULT NULL COMMENT 'PAN Number',
    `tan_number` varchar(10) DEFAULT NULL COMMENT 'TAN Number',
    `tds_section` varchar(100) DEFAULT NULL COMMENT 'TDS Section',
    `tds_rate` varchar(50) DEFAULT NULL COMMENT 'TDS Rate',
    `penalty_rate` varchar(50) DEFAULT NULL COMMENT 'Penalty Rate',
    `tds_section_applicable` varchar(100) DEFAULT NULL COMMENT 'TDS Section Applicable',
    `enable_automatic_tds_posting` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Enable automatic TDS posting',
    `msme_udyam_no` varchar(50) DEFAULT NULL COMMENT 'MSME Udyam Registration Number',
    `fssai_license_no` varchar(50) DEFAULT NULL COMMENT 'FSSAI License Number',
    `import_export_code` varchar(50) DEFAULT NULL COMMENT 'Import Export Code (IEC)',
    `eou_status` varchar(100) DEFAULT NULL COMMENT 'Export Oriented Unit Status',
    `cin_number` varchar(21) DEFAULT NULL COMMENT 'CIN Number',
    `tcs_section_applicable` varchar(200) DEFAULT NULL COMMENT 'TCS Section Applicable',
    `tcs_rate` varchar(50) DEFAULT NULL COMMENT 'TCS Rate',
    `msme_file` varchar(255) DEFAULT NULL COMMENT 'MSME Certificate',
    `fssai_file` varchar(255) DEFAULT NULL COMMENT 'FSSAI License',
    `import_export_file` varchar(255) DEFAULT NULL COMMENT 'IEC Certificate',
    `eou_file` varchar(255) DEFAULT NULL COMMENT 'EOU Certificate',
    `is_active` tinyint(1) NOT NULL DEFAULT '1',
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL COMMENT 'Created by user',
    `updated_by` varchar(100) DEFAULT NULL COMMENT 'Updated by user',
    PRIMARY KEY (`id`),
    KEY `vendor_tds_tenant_id_idx` (`tenant_id`),
    KEY `vendor_tds_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`),
    CONSTRAINT `vendor_tds_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master TDS & Other Statutory Details';


  -- Table: inventory_master_category

  CREATE TABLE `inventory_master_category` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` CHAR(36) NOT NULL,
    `category` VARCHAR(255) NOT NULL,
    `group` VARCHAR(255) NOT NULL DEFAULT '',
    `subgroup` VARCHAR(255) NOT NULL DEFAULT '',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`id`),

    UNIQUE KEY `inventory_master_category_uniq`
    (
      `tenant_id`,
      `category`(100),
      `group`(100),
      `subgroup`(100)
    ),

    KEY `inventory_master_category_tenant_id_idx` (`tenant_id`),
    KEY `inventory_master_category_is_active_idx` (`tenant_id`, `is_active`),
    KEY `inventory_master_category_category_idx` (`category`(100)),

    CONSTRAINT `inventory_master_category_tenant_id_fk`
      FOREIGN KEY (`tenant_id`)
      REFERENCES `tenants` (`id`)
      ON DELETE CASCADE
  )
  ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

  -- Table: inventory_master_location

  CREATE TABLE `inventory_master_location` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL COMMENT 'Location name',
    `location_type` VARCHAR(50) NOT NULL COMMENT 'Type of location (predefined or custom)',
    `address_line1` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Address Line 1 (Required)',
    `address_line2` VARCHAR(255) DEFAULT NULL COMMENT 'Address Line 2 (Optional)',
    `address_line3` VARCHAR(255) DEFAULT NULL COMMENT 'Address Line 3 (Optional)',
    `city` VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'City',
    `state` VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'State',
    `country` VARCHAR(100) NOT NULL DEFAULT 'India' COMMENT 'Country',
    `pincode` VARCHAR(20) NOT NULL DEFAULT '' COMMENT 'Pincode/Zip Code',
    `vendor_name` VARCHAR(255) DEFAULT NULL COMMENT 'Vendor/Agent Name',
    `customer_name` VARCHAR(255) DEFAULT NULL COMMENT 'Customer Name',
    `location_address` VARCHAR(255) DEFAULT NULL COMMENT 'Location Address Reference',
    `gstin` VARCHAR(15) DEFAULT NULL COMMENT 'GSTIN (Optional)',
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`id`),

    KEY `inventory_master_location_tenant_id_idx` (`tenant_id`),
    KEY `inventory_master_location_name_idx` (`tenant_id`, `name`),

    CONSTRAINT `inventory_master_location_tenant_id_fk`
      FOREIGN KEY (`tenant_id`)
      REFERENCES `tenants` (`id`)
      ON DELETE CASCADE
  )
  ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Inventory Master Location - Stores warehouse/storage locations';

  -- Table: inventory_master_inventoryitems

  CREATE TABLE `inventory_master_inventoryitems` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` CHAR(36) NOT NULL,
    
    `item_code` VARCHAR(100) NOT NULL COMMENT 'Item Code',
    `item_name` VARCHAR(255) NOT NULL COMMENT 'Item Name',
    `description` TEXT DEFAULT NULL COMMENT 'Item Description',
    
    `category_id` BIGINT DEFAULT NULL COMMENT 'Foreign key to inventory_master_category',
    `category_path` VARCHAR(500) DEFAULT NULL COMMENT 'Full category path string',
    `subgroup_id` BIGINT DEFAULT NULL COMMENT 'Foreign key to inventory_master_category (Subgroup)',
    
    `is_vendor_specific` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Is Vendor Specific Item Code',
    `vendor_specific_name` VARCHAR(255) DEFAULT NULL,
    `vendor_specific_suffix` VARCHAR(50) DEFAULT NULL,
    
    `uom` VARCHAR(50) NOT NULL COMMENT 'Unit of Measure',
    `alternate_uom` VARCHAR(50) DEFAULT NULL COMMENT 'Alternate Unit',
    `conversion_factor` DECIMAL(15,4) DEFAULT NULL COMMENT 'Conversion factor to alternate unit',
    
    `rate` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Rate',
    `rate_unit` VARCHAR(50) DEFAULT NULL COMMENT 'Rate per Unit',
    
    `hsn_code` VARCHAR(20) DEFAULT NULL,
    `gst_rate` DECIMAL(5,2) DEFAULT NULL,
    
    `reorder_level` VARCHAR(255) DEFAULT NULL COMMENT 'Reorder Level Information',
    `is_saleable` TINYINT(1) NOT NULL DEFAULT 0,
    
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`id`),

    KEY `inv_items_tenant_id_idx` (`tenant_id`),
    KEY `inv_items_category_id_idx` (`category_id`),
    KEY `inv_items_item_code_idx` (`item_code`),

    CONSTRAINT `inv_items_tenant_id_fk`
      FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
    CONSTRAINT `inv_items_category_fk`
      FOREIGN KEY (`category_id`) REFERENCES `inventory_master_category` (`id`) ON DELETE SET NULL
  )
  ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Inventory Master Items';


  --
  -- Table structure for table `vendor_master_banking`
  --

  CREATE TABLE IF NOT EXISTS `vendor_master_vendorcreation_banking` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
    `bank_account_no` varchar(50) NOT NULL COMMENT 'Bank Account Number',
    `bank_name` varchar(200) NOT NULL COMMENT 'Bank Name',
    `ifsc_code` varchar(11) NOT NULL COMMENT 'IFSC Code',
    `branch_name` varchar(200) DEFAULT NULL COMMENT 'Branch Name',
    `swift_code` varchar(11) DEFAULT NULL COMMENT 'SWIFT Code',
    `vendor_branch` varchar(200) DEFAULT NULL COMMENT 'Associate to a vendor branch',
    `account_type` varchar(20) NOT NULL DEFAULT 'current' COMMENT 'Type of bank account',
    `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this banking detail is active',
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL COMMENT 'Created by user',
    `updated_by` varchar(100) DEFAULT NULL COMMENT 'Updated by user',
    PRIMARY KEY (`id`),
    KEY `vendor_banking_tenant_id_idx` (`tenant_id`),
    KEY `vendor_banking_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`),
    KEY `vendor_banking_bank_account_no_idx` (`bank_account_no`),
    CONSTRAINT `vendor_banking_vendor_fk`
      FOREIGN KEY (`vendor_basic_detail_id`)
      REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`)
      ON DELETE CASCADE
  ) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Vendor Master Banking Information';


  --
  -- Table structure for table `vendor_master_terms`
  --

  CREATE TABLE IF NOT EXISTS `vendor_master_vendorcreation_terms` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
    `credit_limit` decimal(15,2) DEFAULT NULL COMMENT 'Credit limit amount',
    `credit_period` varchar(100) DEFAULT NULL COMMENT 'Credit period (e.g., 30 days, 60 days)',
    `credit_terms` text COMMENT 'Credit terms and conditions',
    `penalty_terms` text COMMENT 'Penalty terms for late payments or breaches',
    `delivery_terms` text COMMENT 'Delivery terms, lead time, shipping conditions',
    `warranty_guarantee_details` text COMMENT 'Warranty and guarantee terms',
    `force_majeure` text COMMENT 'Force majeure clauses',
    `dispute_redressal_terms` text COMMENT 'Dispute resolution and redressal terms',
    `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this terms detail is active',
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL COMMENT 'Created by user',
    `updated_by` varchar(100) DEFAULT NULL COMMENT 'Updated by user',
    PRIMARY KEY (`id`),
    KEY `vendor_terms_tenant_id_idx` (`tenant_id`),
    KEY `vendor_terms_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`),
    CONSTRAINT `vendor_terms_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master Terms and Conditions';
  --
  -- Table structure for table `vendor_transaction_po`
  -- Purchase Order transaction table for vendors
  --

  CREATE TABLE IF NOT EXISTS `vendor_transaction_po` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `po_number` varchar(50) NOT NULL COMMENT 'Purchase Order Number',
    `po_series_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_posettings',
    `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
    `vendor_name` varchar(200) DEFAULT NULL COMMENT 'Vendor name (denormalized)',
    `branch` varchar(200) DEFAULT NULL COMMENT 'Vendor branch',
    `address_line1` varchar(255) DEFAULT NULL COMMENT 'Address Line 1',
    `address_line2` varchar(255) DEFAULT NULL COMMENT 'Address Line 2',
    `address_line3` varchar(255) DEFAULT NULL COMMENT 'Address Line 3',
    `city` varchar(100) DEFAULT NULL COMMENT 'City',
    `state` varchar(100) DEFAULT NULL COMMENT 'State',
    `country` varchar(100) DEFAULT NULL COMMENT 'Country',
    `pincode` varchar(20) DEFAULT NULL COMMENT 'Pincode',
    `email_address` varchar(255) DEFAULT NULL COMMENT 'Email Address',
    `contract_no` varchar(100) DEFAULT NULL COMMENT 'Contract Number',
    `receive_by` date DEFAULT NULL COMMENT 'Expected receive date',
    `receive_at` varchar(200) DEFAULT NULL COMMENT 'Receive at location',
    `delivery_terms` text COMMENT 'Delivery terms and conditions',
    `total_taxable_value` decimal(15,2) DEFAULT 0.00 COMMENT 'Total taxable value',
    `total_tax` decimal(15,2) DEFAULT 0.00 COMMENT 'Total tax amount',
    `total_value` decimal(15,2) DEFAULT 0.00 COMMENT 'Total PO value',
    `status` varchar(50) DEFAULT 'Draft' COMMENT 'PO Status: Draft, Pending Approval, Approved, Mailed, Closed',
    `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this PO is active',
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL COMMENT 'Created by user',
    `updated_by` varchar(100) DEFAULT NULL COMMENT 'Updated by user',
    PRIMARY KEY (`id`),
    UNIQUE KEY `vendor_po_tenant_number_unique` (`tenant_id`,`po_number`),
    KEY `vendor_po_tenant_id_idx` (`tenant_id`),
    KEY `vendor_po_series_id_idx` (`po_series_id`),
    KEY `vendor_po_vendor_id_idx` (`vendor_basic_detail_id`),
    KEY `vendor_po_status_idx` (`status`),
    CONSTRAINT `vendor_po_series_fk` FOREIGN KEY (`po_series_id`) REFERENCES `vendor_master_posettings` (`id`) ON DELETE SET NULL,
    CONSTRAINT `vendor_po_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Purchase Order Transactions';

  CREATE TABLE `vendor_transaction_po_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` VARCHAR(36) NOT NULL,
    `item_code` VARCHAR(50) NOT NULL,
    `item_name` VARCHAR(200) NOT NULL,
    `supplier_item_code` VARCHAR(50) DEFAULT NULL,
    `quantity` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `uom` VARCHAR(20) NOT NULL,
    `negotiated_rate` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `final_rate` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `taxable_value` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `gst_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    `gst_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `invoice_value` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `po_id` BIGINT NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_vendor_po_items_tenant` (`tenant_id`),
    INDEX `idx_vendor_po_items_po` (`po_id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  --
  -- Separate Master Tables for Each Voucher Type
  -- This replaces the single voucher_configuration table
  -- Each table includes "include_from_existing_series" column
  --

  --
  -- Table: master_voucher_sales
  --
  CREATE TABLE IF NOT EXISTS `master_voucher_sales` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `voucher_name` varchar(100) NOT NULL COMMENT 'Voucher name',
    `prefix` varchar(20) DEFAULT NULL COMMENT 'Prefix for voucher number',
    `suffix` varchar(20) DEFAULT NULL COMMENT 'Suffix for voucher number',
    `start_from` int DEFAULT 1 COMMENT 'Starting number',
    `current_number` int DEFAULT 1 COMMENT 'Current number in sequence',
    `required_digits` int DEFAULT 4 COMMENT 'Number of digits for padding',
    `enable_auto_numbering` tinyint(1) DEFAULT 1 COMMENT 'Enable automatic numbering',
    `include_from_existing_series` varchar(200) DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
    `is_active` tinyint(1) NOT NULL DEFAULT 1,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL,
    `updated_by` varchar(100) DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_sales` (`tenant_id`),
    KEY `idx_voucher_name_sales` (`voucher_name`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Sales Voucher Master';

  --
  -- Table: master_voucher_creditnote
  --
  CREATE TABLE IF NOT EXISTS `master_voucher_creditnote` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `voucher_name` varchar(100) NOT NULL COMMENT 'Voucher name',
    `prefix` varchar(20) DEFAULT NULL COMMENT 'Prefix for voucher number',
    `suffix` varchar(20) DEFAULT NULL COMMENT 'Suffix for voucher number',
    `start_from` int DEFAULT 1 COMMENT 'Starting number',
    `current_number` int DEFAULT 1 COMMENT 'Current number in sequence',
    `required_digits` int DEFAULT 4 COMMENT 'Number of digits for padding',
    `enable_auto_numbering` tinyint(1) DEFAULT 1 COMMENT 'Enable automatic numbering',
    `include_from_existing_series` varchar(200) DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
    `is_active` tinyint(1) NOT NULL DEFAULT 1,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL,
    `updated_by` varchar(100) DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_creditnote` (`tenant_id`),
    KEY `idx_voucher_name_creditnote` (`voucher_name`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Credit Note Voucher Master';

  --
  -- Table: master_voucher_receipts
  --
  CREATE TABLE IF NOT EXISTS `master_voucher_receipts` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `voucher_name` varchar(100) NOT NULL COMMENT 'Voucher name',
    `prefix` varchar(20) DEFAULT NULL COMMENT 'Prefix for voucher number',
    `suffix` varchar(20) DEFAULT NULL COMMENT 'Suffix for voucher number',
    `start_from` int DEFAULT 1 COMMENT 'Starting number',
    `current_number` int DEFAULT 1 COMMENT 'Current number in sequence',
    `required_digits` int DEFAULT 4 COMMENT 'Number of digits for padding',
    `enable_auto_numbering` tinyint(1) DEFAULT 1 COMMENT 'Enable automatic numbering',
    `include_from_existing_series` varchar(200) DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
    `is_active` tinyint(1) NOT NULL DEFAULT 1,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL,
    `updated_by` varchar(100) DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_receipts` (`tenant_id`),
    KEY `idx_voucher_name_receipts` (`voucher_name`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Receipts Voucher Master';

  --
  -- Table: master_voucher_purchases
  --
  CREATE TABLE IF NOT EXISTS `master_voucher_purchases` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
    `voucher_name` varchar(100) NOT NULL COMMENT 'Voucher name',
    `prefix` varchar(20) DEFAULT NULL COMMENT 'Prefix for voucher number',
    `suffix` varchar(20) DEFAULT NULL COMMENT 'Suffix for voucher number',
    `start_from` int DEFAULT 1 COMMENT 'Starting number',
    `current_number` int DEFAULT 1 COMMENT 'Current number in sequence',
    `required_digits` int DEFAULT 4 COMMENT 'Number of digits for padding',
    `enable_auto_numbering` tinyint(1) DEFAULT 1 COMMENT 'Enable automatic numbering',
    `include_from_existing_series` varchar(200) DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
    `is_active` tinyint(1) NOT NULL DEFAULT 1,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `created_by` varchar(100) DEFAULT NULL,
    `updated_by` varchar(100) DEFAULT NULL,
    PRIMARY KEY (`id`),
  KEY `idx_tenant_purchases` (`tenant_id`),
  KEY `idx_voucher_name_purchases` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Purchases Voucher Master';

--
-- Table: master_voucher_debitnote
--
CREATE TABLE IF NOT EXISTS `master_voucher_debitnote` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT 1 COMMENT 'Starting number',
  `current_number` int DEFAULT 1 COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT 4 COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT 1 COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_debitnote` (`tenant_id`),
  KEY `idx_voucher_name_debitnote` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Debit Note Voucher Master';

--
-- Table: master_voucher_payments
--
CREATE TABLE IF NOT EXISTS `master_voucher_payments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT 1 COMMENT 'Starting number',
  `current_number` int DEFAULT 1 COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT 4 COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT 1 COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_payments` (`tenant_id`),
  KEY `idx_voucher_name_payments` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Payments Voucher Master';

--
-- Table: master_voucher_expenses
--
CREATE TABLE IF NOT EXISTS `master_voucher_expenses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT 1 COMMENT 'Starting number',
  `current_number` int DEFAULT 1 COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT 4 COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT 1 COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_expenses` (`tenant_id`),
  KEY `idx_voucher_name_expenses` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Expenses Voucher Master';

--
-- Table: master_voucher_journal
--
CREATE TABLE IF NOT EXISTS `master_voucher_journal` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT 1 COMMENT 'Starting number',
  `current_number` int DEFAULT 1 COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT 4 COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT 1 COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_journal` (`tenant_id`),
  KEY `idx_voucher_name_journal` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Journal Voucher Master';

--
-- Table: master_voucher_contra
--
CREATE TABLE IF NOT EXISTS `master_voucher_contra` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT 1 COMMENT 'Starting number',
  `current_number` int DEFAULT 1 COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT 4 COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT 1 COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_contra` (`tenant_id`),
  KEY `idx_voucher_name_contra` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Contra Voucher Master';


--
-- Table: customer_masters_salesquotation
--
CREATE TABLE IF NOT EXISTS `customer_masters_salesquotation` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `series_name` varchar(100) NOT NULL COMMENT 'Name of the sales quotation series',
  `customer_category` varchar(100) DEFAULT NULL COMMENT 'Customer category (Retail, Wholesale, Corporate, etc.)',
  `prefix` varchar(20) DEFAULT 'SQ/' COMMENT 'Prefix for quotation number (e.g., SQ/)',
  `suffix` varchar(20) DEFAULT '/24-25' COMMENT 'Suffix for quotation number (e.g., /24-25)',
  `required_digits` int DEFAULT 4 COMMENT 'Number of digits for sequence padding',
  `current_number` int DEFAULT 0 COMMENT 'Current number in the sequence',
  `auto_year` tinyint(1) DEFAULT 0 COMMENT 'Auto-include year in quotation number',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Whether this series is active',
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Soft delete flag',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL COMMENT 'Created by user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_sq_tenant_series_unique` (`tenant_id`,`series_name`),
  KEY `customer_sq_tenant_id_idx` (`tenant_id`),
  KEY `customer_sq_category_idx` (`customer_category`),
  KEY `customer_sq_is_active_idx` (`is_active`),
  KEY `customer_sq_is_deleted_idx` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Portal - Sales Quotation Series Configuration';


-- Table: customer_master_category

CREATE TABLE `customer_master_category` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `category` varchar(255) NOT NULL COMMENT 'Top-level category',
  `group` varchar(255) NOT NULL DEFAULT '' COMMENT 'Group under category',
  `subgroup` varchar(255) NOT NULL DEFAULT '' COMMENT 'Subgroup under group',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this category is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (`id`),

  UNIQUE KEY `customer_category_tenant_unique`
    (`tenant_id`, `category`(100), `group`(100), `subgroup`(100)),

  KEY `customer_category_tenant_id_idx` (`tenant_id`),
  KEY `customer_category_is_active_idx` (`tenant_id`, `is_active`),
  KEY `customer_category_category_idx` (`category`(100))
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci
COMMENT='Customer Master Category Hierarchy';



-- Table: customer_master_longtermcontracts_basicdetails

CREATE TABLE `customer_master_longtermcontracts_basicdetails` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `contract_number` varchar(50) NOT NULL,
  `customer_id` int NOT NULL COMMENT 'Reference to customer',
  `customer_name` varchar(255) NOT NULL COMMENT 'Customer name for display',
  `branch_id` int DEFAULT NULL COMMENT 'Reference to branch',
  `contract_type` varchar(50) NOT NULL,
  `contract_validity_from` date NOT NULL,
  `contract_validity_to` date NOT NULL,
  `contract_document` varchar(500) DEFAULT NULL COMMENT 'File path to uploaded contract document',
  `automate_billing` tinyint(1) NOT NULL DEFAULT 0,
  `bill_start_date` date DEFAULT NULL,
  `billing_frequency` varchar(20) DEFAULT NULL,
  `voucher_name` varchar(100) DEFAULT NULL,
  `bill_period_from` date DEFAULT NULL,
  `bill_period_to` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_ltc_basic_tenant_contract_unique` (`tenant_id`,`contract_number`),
  KEY `cust_ltc_basic_tenant_id_idx` (`tenant_id`),
  KEY `cust_ltc_basic_customer_id_idx` (`tenant_id`, `customer_id`),
  KEY `cust_ltc_basic_validity_idx` (`contract_validity_from`, `contract_validity_to`),
  KEY `cust_ltc_basic_is_deleted_idx` (`tenant_id`, `is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Master Long-term Contract Basic Details';


-- Table: customer_master_longtermcontracts_productservices

CREATE TABLE `customer_master_longtermcontracts_productservices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `contract_basic_detail_id` int NOT NULL COMMENT 'Foreign key to customer_master_longtermcontracts_basicdetails',
  `item_code` varchar(50) NOT NULL COMMENT 'Our item code',
  `item_name` varchar(200) NOT NULL COMMENT 'Our item name',
  `customer_item_name` varchar(200) DEFAULT NULL COMMENT 'Customer''s item name',
  `qty_min` decimal(15,2) DEFAULT NULL COMMENT 'Minimum quantity',
  `qty_max` decimal(15,2) DEFAULT NULL COMMENT 'Maximum quantity',
  `price_min` decimal(15,2) DEFAULT NULL COMMENT 'Minimum price',
  `price_max` decimal(15,2) DEFAULT NULL COMMENT 'Maximum price',
  `acceptable_price_deviation` varchar(50) DEFAULT NULL COMMENT 'e.g., ±5%',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `cust_ltc_prod_tenant_item_idx` (`tenant_id`, `item_code`),
  KEY `cust_ltc_prod_contract_idx` (`contract_basic_detail_id`),
  CONSTRAINT `cust_ltc_prod_contract_fk` FOREIGN KEY (`contract_basic_detail_id`) REFERENCES `customer_master_longtermcontracts_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Master Long-term Contract Products/Services';


-- Table: customer_master_longtermcontracts_termscondition

CREATE TABLE `customer_master_longtermcontracts_termscondition` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `contract_basic_detail_id` int NOT NULL COMMENT 'Foreign key to customer_master_longtermcontracts_basicdetails',
  `payment_terms` longtext DEFAULT NULL,
  `penalty_terms` longtext DEFAULT NULL,
  `force_majeure` longtext DEFAULT NULL,
  `termination_clause` longtext DEFAULT NULL,
  `dispute_terms` longtext DEFAULT NULL COMMENT 'Dispute & Redressal Terms',
  `others` longtext DEFAULT NULL COMMENT 'Other terms',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_ltc_terms_contract_unique` (`contract_basic_detail_id`),
  KEY `cust_ltc_terms_tenant_idx` (`tenant_id`),
  CONSTRAINT `cust_ltc_terms_contract_fk` FOREIGN KEY (`contract_basic_detail_id`) REFERENCES `customer_master_longtermcontracts_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Master Long-term Contract Terms & Conditions';


-- Table: customer_master_customer_basicdetails
CREATE TABLE `customer_master_customer_basicdetails` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `customer_code` varchar(50) NOT NULL,
  `customer_name` varchar(255) NOT NULL,
  `customer_category_id` bigint DEFAULT NULL,
  `pan_number` varchar(10) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `email_address` varchar(254) DEFAULT NULL,
  `contact_number` varchar(15) DEFAULT NULL,
  `is_also_vendor` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_basic_tenant_code_uniq` (`tenant_id`,`customer_code`),
  UNIQUE KEY `customer_basic_tenant_id_uniq` (`tenant_id`, `id`),
  KEY `customer_basic_tenant_id_idx` (`tenant_id`),
  KEY `customer_basic_category_idx` (`customer_category_id`),
  CONSTRAINT `customer_basic_category_fk` FOREIGN KEY (`customer_category_id`) REFERENCES `customer_master_category` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: customer_master_customer_gstdetails
CREATE TABLE `customer_master_customer_gstdetails` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `customer_basic_detail_id` bigint NOT NULL,
  `gstin` varchar(15) DEFAULT NULL,
  `is_unregistered` tinyint(1) NOT NULL DEFAULT '0',
  `branch_reference_name` varchar(255) DEFAULT NULL,
  `branch_address` longtext,
  `branch_contact_person` varchar(255) DEFAULT NULL,
  `branch_email` varchar(254) DEFAULT NULL,
  `branch_contact_number` varchar(15) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `customer_gst_tenant_gstin_idx` (`tenant_id`,`gstin`),
  KEY `customer_gst_basic_detail_idx` (`customer_basic_detail_id`),
  CONSTRAINT `customer_gst_basic_detail_fk` FOREIGN KEY (`customer_basic_detail_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: customer_master_customer_tds
CREATE TABLE `customer_master_customer_tds` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `customer_basic_detail_id` bigint NOT NULL,
  `msme_no` varchar(50) DEFAULT NULL,
  `fssai_no` varchar(50) DEFAULT NULL,
  `iec_code` varchar(50) DEFAULT NULL,
  `eou_status` varchar(100) DEFAULT NULL,
  `tcs_section` varchar(50) DEFAULT NULL,
  `tcs_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `tds_section` varchar(50) DEFAULT NULL,
  `tds_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_tds_basic_detail_uniq` (`customer_basic_detail_id`),
  KEY `customer_tds_tenant_idx` (`tenant_id`),
  CONSTRAINT `customer_tds_basic_detail_fk` FOREIGN KEY (`customer_basic_detail_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: customer_master_customer_banking
CREATE TABLE `customer_master_customer_banking` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `customer_basic_detail_id` bigint NOT NULL,
  `account_number` varchar(50) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `ifsc_code` varchar(11) DEFAULT NULL,
  `branch_name` varchar(255) DEFAULT NULL,
  `swift_code` varchar(11) DEFAULT NULL,
  `associated_branches` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `customer_bank_tenant_acc_idx` (`tenant_id`,`account_number`),
  KEY `customer_bank_basic_detail_idx` (`customer_basic_detail_id`),
  CONSTRAINT `customer_bank_basic_detail_fk` FOREIGN KEY (`customer_basic_detail_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: customer_master_customer_productservice
CREATE TABLE `customer_master_customer_productservice` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) DEFAULT NULL,
  `customer_basic_detail_id` bigint DEFAULT NULL,
  `item_code` varchar(50) DEFAULT NULL COMMENT 'Our Item Code',
  `item_name` varchar(200) DEFAULT NULL COMMENT 'Our Item Name',
  `uom` varchar(50) DEFAULT NULL COMMENT 'Unit of Measure',
  `customer_item_code` varchar(50) DEFAULT NULL COMMENT 'Customer Item Code',
  `customer_item_name` varchar(200) DEFAULT NULL COMMENT 'Customer Item Name',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `customer_prod_tenant_item_idx` (`tenant_id`,`item_code`),
  KEY `customer_prod_basic_detail_idx` (`customer_basic_detail_id`),
  CONSTRAINT `customer_prod_basic_detail_fk` FOREIGN KEY (`customer_basic_detail_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: customer_master_customer_termscondition
CREATE TABLE `customer_master_customer_termscondition` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) DEFAULT NULL,
  `customer_basic_detail_id` bigint DEFAULT NULL,
  `credit_period` varchar(50) DEFAULT NULL,
  `credit_terms` longtext,
  `penalty_terms` longtext,
  `delivery_terms` longtext,
  `warranty_details` longtext,
  `force_majeure` longtext,
  `dispute_terms` longtext,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_terms_basic_detail_uniq` (`customer_basic_detail_id`),
  KEY `customer_terms_tenant_idx` (`tenant_id`),
  CONSTRAINT `customer_terms_basic_detail_fk` FOREIGN KEY (`customer_basic_detail_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: customer_transaction_salesquotation_general
CREATE TABLE `customer_transaction_salesquotation_general` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `quote_number` varchar(50) NOT NULL,
  `customer_category` varchar(100) DEFAULT NULL,
  `effective_from` date DEFAULT NULL,
  `effective_to` date DEFAULT NULL,
  `items` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_trans_salesquotation_gen_quote_uniq` (`quote_number`),
  KEY `customer_trans_salesquotation_gen_tenant_idx` (`tenant_id`,`quote_number`),
  KEY `customer_trans_salesquotation_gen_eff_from_idx` (`effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: customer_transaction_salesquotation_specific
CREATE TABLE `customer_transaction_salesquotation_specific` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `quote_number` varchar(50) NOT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `branch` varchar(100) DEFAULT NULL,
  `address` longtext,
  `email` varchar(254) DEFAULT NULL,
  `contact_no` varchar(20) DEFAULT NULL,
  `validity_from` date DEFAULT NULL,
  `validity_to` date DEFAULT NULL,
  `tentative_delivery_date` date DEFAULT NULL,
  `payment_terms` longtext,
  `items` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_trans_salesquotation_spec_quote_uniq` (`quote_number`),
  KEY `customer_trans_salesquotation_spec_tenant_idx` (`tenant_id`,`quote_number`),
  KEY `customer_trans_salesquotation_spec_val_from_idx` (`validity_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- CUSTOMER TRANSACTION: SALES ORDER TABLES
-- ============================================================================

-- Table 1: customer_transaction_salesorder_basicdetails
-- Stores basic details of sales orders
CREATE TABLE `customer_transaction_salesorder_basicdetails` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `so_series_name` varchar(100) DEFAULT NULL COMMENT 'SO Series Name',
  `so_number` varchar(50) NOT NULL COMMENT 'Sales Order Number (auto-generated)',
  `date` date NOT NULL COMMENT 'Sales Order Date',
  `customer_po_number` varchar(100) DEFAULT NULL COMMENT 'Customer PO Number',
  `customer_name` varchar(255) NOT NULL COMMENT 'Customer Name',
  `branch` varchar(255) DEFAULT NULL COMMENT 'Branch',
  `address` longtext COMMENT 'Address',
  `email` varchar(254) DEFAULT NULL COMMENT 'Email Address',
  `contact_number` varchar(20) DEFAULT NULL COMMENT 'Contact Number',
  `gst_no` varchar(20) DEFAULT NULL COMMENT 'GST Number',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_trans_so_basic_so_number_uniq` (`tenant_id`, `so_number`),
  KEY `cust_trans_so_basic_tenant_idx` (`tenant_id`),
  KEY `cust_trans_so_basic_customer_idx` (`customer_name`),
  KEY `cust_trans_so_basic_date_idx` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Transaction - Sales Order Basic Details';


-- Table 2: customer_transaction_salesorder_items
-- Stores item details for each sales order
CREATE TABLE `customer_transaction_salesorder_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `so_basic_detail_id` bigint NOT NULL COMMENT 'Foreign key to customer_transaction_salesorder_basicdetails',
  `item_code` varchar(50) DEFAULT NULL COMMENT 'Item Code',
  `item_name` varchar(255) DEFAULT NULL COMMENT 'Item Name',
  `quantity` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Quantity',
  `price` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Price per unit',
  `taxable_value` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Taxable Value (Qty * Price)',
  `gst` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'GST Amount',
  `gst_rate` decimal(5,2) DEFAULT '0.00' COMMENT 'GST Rate (%)',
  `net_value` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Net Value (Taxable + GST)',
  `uom` varchar(50) DEFAULT NULL COMMENT 'Unit of Measure',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `cust_trans_so_items_tenant_idx` (`tenant_id`),
  KEY `cust_trans_so_items_basic_detail_idx` (`so_basic_detail_id`),
  CONSTRAINT `cust_trans_so_items_basic_detail_fk` FOREIGN KEY (`so_basic_detail_id`) REFERENCES `customer_transaction_salesorder_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Transaction - Sales Order Items';


-- Table 3: customer_transaction_salesorder_deliveryterms
-- Stores delivery terms for each sales order
CREATE TABLE `customer_transaction_salesorder_deliveryterms` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `so_basic_detail_id` bigint NOT NULL COMMENT 'Foreign key to customer_transaction_salesorder_basicdetails',
  `deliver_at` varchar(500) DEFAULT NULL COMMENT 'Delivery Address',
  `delivery_date` date DEFAULT NULL COMMENT 'Delivery Date',
  `third_party_address` json DEFAULT NULL COMMENT 'Third Party Delivery Address Details',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_trans_so_delivery_basic_detail_uniq` (`so_basic_detail_id`),
  KEY `cust_trans_so_delivery_tenant_idx` (`tenant_id`),
  CONSTRAINT `cust_trans_so_delivery_basic_detail_fk` FOREIGN KEY (`so_basic_detail_id`) REFERENCES `customer_transaction_salesorder_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Transaction - Sales Order Delivery Terms';


-- Table 4: customer_transaction_salesorder_payment_salesperson
-- Stores payment terms and salesperson details for each sales order
CREATE TABLE `customer_transaction_salesorder_payment_salesperson` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `so_basic_detail_id` bigint NOT NULL COMMENT 'Foreign key to customer_transaction_salesorder_basicdetails',
  `credit_period` varchar(100) DEFAULT NULL COMMENT 'Credit Period',
  `salesperson_in_charge` varchar(255) DEFAULT NULL COMMENT 'Salesperson In Charge',
  `employee_id` varchar(50) DEFAULT NULL COMMENT 'Employee ID / Agent ID',
  `employee_name` varchar(255) DEFAULT NULL COMMENT 'Employee Name / Agent Name',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_trans_so_pay_sp_basic_detail_uniq` (`so_basic_detail_id`),
  KEY `cust_trans_so_pay_sp_tenant_idx` (`tenant_id`),
  CONSTRAINT `cust_trans_so_pay_sp_basic_detail_fk` FOREIGN KEY (`so_basic_detail_id`) REFERENCES `customer_transaction_salesorder_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Transaction - Sales Order Payment and Salesperson';


-- Table 5: customer_transaction_salesorder_quotation_details
-- Stores quotation linking details for each sales order
CREATE TABLE `customer_transaction_salesorder_quotation_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `so_basic_detail_id` bigint NOT NULL COMMENT 'Foreign key to customer_transaction_salesorder_basicdetails',
  `quotation_type` varchar(50) DEFAULT NULL COMMENT 'Type: Sales Quotation or Contract',
  `quotation_number` varchar(100) DEFAULT NULL COMMENT 'Sales Quotation # / Contract #',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_trans_so_quote_basic_detail_uniq` (`so_basic_detail_id`),
  KEY `cust_trans_so_quote_tenant_idx` (`tenant_id`),
  CONSTRAINT `cust_trans_so_quote_basic_detail_fk` FOREIGN KEY (`so_basic_detail_id`) REFERENCES `customer_transaction_salesorder_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Transaction - Sales Order Quotation Details';

-- Table structure for table `payroll_employee_basic_details`
--

CREATE TABLE `payroll_employee_basic_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `employee_code` varchar(50) NOT NULL,
  `employee_name` varchar(200) NOT NULL,
  `email` varchar(254) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `address` longtext,
  `status` varchar(10) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_code` (`employee_code`),
  UNIQUE KEY `payroll_employee_basic_d_tenant_id_employee_code_01313797_uniq` (`tenant_id`,`employee_code`),
  KEY `payroll_employee_basic_details_tenant_id_b56eac73` (`tenant_id`),
  KEY `payroll_emp_tenant__3c85ef_idx` (`tenant_id`,`status`),
  KEY `payroll_emp_employe_d77d0c_idx` (`employee_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `payroll_employee_employment`
--

CREATE TABLE `payroll_employee_employment` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `department` varchar(100) DEFAULT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `date_of_joining` date DEFAULT NULL,
  `employment_type` varchar(20) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `employee_basic_id` bigint NOT NULL,
  `tenant_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_basic_id` (`employee_basic_id`),
  KEY `idx_tenant` (`tenant_id`),
  CONSTRAINT `payroll_employee_emp_employee_basic_id_362bd41e_fk_payroll_e` FOREIGN KEY (`employee_basic_id`) REFERENCES `payroll_employee_basic_details` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `payroll_employee_salary`
--

  CREATE TABLE `payroll_employee_salary` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `basic_salary` decimal(12,2) NOT NULL,
    `hra` decimal(12,2) NOT NULL,
    `created_at` datetime(6) NOT NULL,
    `updated_at` datetime(6) NOT NULL,
    `employee_basic_id` bigint NOT NULL,
    `tenant_id` varchar(36) DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `employee_basic_id` (`employee_basic_id`),
    KEY `idx_tenant` (`tenant_id`),
    CONSTRAINT `payroll_employee_sal_employee_basic_id_cdfba561_fk_payroll_e` FOREIGN KEY (`employee_basic_id`) REFERENCES `payroll_employee_basic_details` (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `payroll_employee_statutory`
--

CREATE TABLE `payroll_employee_statutory` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `pan_number` varchar(10) DEFAULT NULL,
  `uan_number` varchar(12) DEFAULT NULL,
  `esi_number` varchar(17) DEFAULT NULL,
  `aadhar_number` varchar(12) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `employee_basic_id` bigint NOT NULL,
  `tenant_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_basic_id` (`employee_basic_id`),
  KEY `idx_tenant` (`tenant_id`),
  CONSTRAINT `payroll_employee_sta_employee_basic_id_893b5c6c_fk_payroll_e` FOREIGN KEY (`employee_basic_id`) REFERENCES `payroll_employee_basic_details` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `payroll_employee_bank_details`
--

CREATE TABLE `payroll_employee_bank_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `account_number` varchar(20) DEFAULT NULL,
  `ifsc_code` varchar(11) DEFAULT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `branch_name` varchar(100) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `employee_basic_id` bigint NOT NULL,
  `tenant_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_basic_id` (`employee_basic_id`),
  KEY `idx_tenant` (`tenant_id`),
  CONSTRAINT `payroll_employee_ban_employee_basic_id_0c5268e7_fk_payroll_e` FOREIGN KEY (`employee_basic_id`) REFERENCES `payroll_employee_basic_details` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `payroll_pay_run`
--

CREATE TABLE `payroll_pay_run` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `pay_run_code` varchar(50) NOT NULL,
  `pay_period` varchar(50) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` varchar(20) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `payment_date` date DEFAULT NULL,
  `total_employees` int NOT NULL DEFAULT '0',
  `gross_pay` decimal(15,2) NOT NULL DEFAULT '0.00',
  `total_deductions` decimal(15,2) NOT NULL DEFAULT '0.00',
  `net_pay` decimal(15,2) NOT NULL DEFAULT '0.00',
  `processed_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pay_run_code` (`pay_run_code`),
  UNIQUE KEY `payroll_pay_run_tenant_id_pay_run_code_fecb4a42_uniq` (`tenant_id`,`pay_run_code`),
  KEY `payroll_pay_run_tenant_id_44d7dcb5` (`tenant_id`),
  KEY `payroll_pay_tenant__859fa0_idx` (`tenant_id`,`status`),
  KEY `payroll_pay_start_d_0e9a8e_idx` (`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `payroll_salary_template`
--

CREATE TABLE `payroll_salary_template` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `template_name` varchar(100) NOT NULL,
  `description` longtext,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payroll_salary_template_tenant_id_template_name_f5ff8dfa_uniq` (`tenant_id`,`template_name`),
  KEY `payroll_salary_template_tenant_id_27fcb732` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
 
      
CREATE TABLE `voucher_sales_dispatchdetails` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  `dispatch_from` LONGTEXT,
  `mode_of_transport` VARCHAR(50),
  `dispatch_date` DATE,
  `dispatch_time` TIME(6),

  `delivery_type` VARCHAR(50),
  `self_third_party` VARCHAR(255),

  `transporter_id` VARCHAR(100),
  `transporter_name` VARCHAR(255),
  `vehicle_no` VARCHAR(50),

  `lr_gr_consignment` VARCHAR(100),
  `dispatch_document` VARCHAR(100),

  `upto_port_shipping_bill_no` VARCHAR(100),
  `upto_port_shipping_bill_date` DATE,
  `upto_port_ship_port_code` VARCHAR(50),
  `upto_port_origin` VARCHAR(100),

  `beyond_port_shipping_bill_no` VARCHAR(100),
  `beyond_port_shipping_bill_date` DATE,
  `beyond_port_ship_port_code` VARCHAR(50),
  `beyond_port_vessel_flight_no` VARCHAR(100),
  `beyond_port_port_of_loading` VARCHAR(100),
  `beyond_port_port_of_discharge` VARCHAR(100),
  `beyond_port_final_destination` VARCHAR(100),
  `beyond_port_origin_country` VARCHAR(100),
  `beyond_port_dest_country` VARCHAR(100),

  `rail_upto_port_delivery_type` VARCHAR(100),
  `rail_upto_port_transporter_id` VARCHAR(100),
  `rail_upto_port_transporter_name` VARCHAR(255),
  `rail_upto_port_vehicle_no` VARCHAR(100),
  `rail_upto_port_lr_gr_consignment` VARCHAR(100),

  `rail_beyond_port_receipt_no` VARCHAR(100),
  `rail_beyond_port_receipt_date` DATE,
  `rail_beyond_port_origin` VARCHAR(100),
  `rail_beyond_port_origin_country` VARCHAR(100),
  `rail_beyond_port_rail_no` VARCHAR(100),
  `rail_beyond_port_fnr_no` VARCHAR(100),
  `rail_beyond_port_station_loading` VARCHAR(100),
  `rail_beyond_port_station_discharge` VARCHAR(100),
  `rail_beyond_port_final_destination` VARCHAR(100),
  `rail_beyond_port_dest_country` VARCHAR(100),

  `invoice_id` BIGINT,

  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_invoice_id` (`invoice_id`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `voucher_sales_ewaybill` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  `eway_bill_available` BOOLEAN DEFAULT 0,
  `eway_bill_no` VARCHAR(50),
  `eway_bill_date` DATE,
  `validity_period` VARCHAR(50),
  `distance` VARCHAR(50),

  `extension_date` DATE,
  `extended_ewb_no` VARCHAR(50),
  `extension_reason` VARCHAR(255),
  `from_place` VARCHAR(100),
  `remaining_distance` VARCHAR(50),
  `new_validity` VARCHAR(50),
  `updated_vehicle_no` VARCHAR(50),
  `irn` VARCHAR(255) DEFAULT NULL,
  `ack_no` VARCHAR(100) DEFAULT NULL,



  `invoice_id` BIGINT,

  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_invoice_id` (`invoice_id`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `voucher_sales_invoicedetails` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  `date` DATE,
  `sales_invoice_no` VARCHAR(50),
  `voucher_name` VARCHAR(100),
  `outward_slip_no` VARCHAR(50),
  `customer_name` VARCHAR(255),
  `customer_id` BIGINT DEFAULT NULL COMMENT 'Link to customer_master_customer_basicdetails.id',
  `customer_branch` VARCHAR(100) DEFAULT NULL,

  `bill_to` LONGTEXT,
  `ship_to` LONGTEXT,

  `gstin` VARCHAR(15),
  `contact` VARCHAR(100),
  `tax_type` VARCHAR(50),
  `state_type` VARCHAR(20),
  `export_type` VARCHAR(50),
  `exchange_rate` VARCHAR(50),
  `supporting_document` VARCHAR(100),
  `sales_order_no` VARCHAR(50),

  -- GST-Compliant Fields
  `place_of_supply` VARCHAR(2) DEFAULT NULL COMMENT 'State code (01-38)',
  `reverse_charge` VARCHAR(1) DEFAULT 'N' COMMENT 'Y or N',
  `invoice_type` VARCHAR(50) DEFAULT 'Regular' COMMENT 'Regular, SEZ with payment, etc.',
  `gst_export_type` VARCHAR(10) DEFAULT NULL COMMENT 'WPAY or WOPAY for exports',
  `port_code` VARCHAR(6) DEFAULT NULL COMMENT '6-digit port code for exports',
  `shipping_bill_number` VARCHAR(50) DEFAULT NULL COMMENT 'Shipping bill number for exports',
  `shipping_bill_date` DATE DEFAULT NULL COMMENT 'Shipping bill date for exports',
  `ecommerce_gstin` VARCHAR(15) DEFAULT NULL COMMENT 'E-commerce GSTIN',
  `irn` VARCHAR(255) DEFAULT NULL,
  `ack_no` VARCHAR(100) DEFAULT NULL,
  
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_sales_invoice_no` (`sales_invoice_no`),
  KEY `idx_sales_tenant_customer` (`tenant_id`, `customer_id`),
  CONSTRAINT `fk_sales_invoice_customer` 
    FOREIGN KEY (`customer_id`) 
    REFERENCES `customer_master_customer_basicdetails` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `voucher_sales_items` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  `item_code` VARCHAR(100),
  `item_name` VARCHAR(255),
  `hsn_sac` VARCHAR(50),

  `qty` DECIMAL(18,4) DEFAULT 0.0000,
  `uom` VARCHAR(50),
  `item_rate` DECIMAL(18,2) DEFAULT 0.00,
  `taxable_value` DECIMAL(18,2) DEFAULT 0.00,

  `igst` DECIMAL(18,2) DEFAULT 0.00,
  `cgst` DECIMAL(18,2) DEFAULT 0.00,
  `sgst` DECIMAL(18,2) DEFAULT 0.00,
  `cess` DECIMAL(18,2) DEFAULT 0.00,

  `invoice_value` DECIMAL(18,2) DEFAULT 0.00,
  `sales_ledger` VARCHAR(255),
  `description` LONGTEXT,
  `alternate_unit` VARCHAR(50),

  `invoice_id` BIGINT,

  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_invoice_id` (`invoice_id`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `voucher_sales_items_foreign` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  `description` LONGTEXT,
  `quantity` DECIMAL(18,4) DEFAULT 0.0000,
  `uqc` VARCHAR(50),
  `rate` DECIMAL(18,2) DEFAULT 0.00,
  `amount` DECIMAL(18,2) DEFAULT 0.00,

  `invoice_id` BIGINT,

  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_invoice_id` (`invoice_id`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `voucher_sales_paymentdetails` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  `payment_taxable_value` DECIMAL(18,2) DEFAULT 0.00,
  `payment_igst` DECIMAL(18,2) DEFAULT 0.00,
  `payment_cgst` DECIMAL(18,2) DEFAULT 0.00,
  `payment_sgst` DECIMAL(18,2) DEFAULT 0.00,
  `payment_cess` DECIMAL(18,2) DEFAULT 0.00,
  `payment_state_cess` DECIMAL(18,2) DEFAULT 0.00,

  `payment_invoice_value` DECIMAL(18,2) DEFAULT 0.00,

  `payment_tds_income_tax` DECIMAL(18,2) DEFAULT 0.00,
  `payment_tds_gst` DECIMAL(18,2) DEFAULT 0.00,
  `payment_advance` DECIMAL(18,2) DEFAULT 0.00,
  `payment_payable` DECIMAL(18,2) DEFAULT 0.00,

  `posting_note` LONGTEXT,
  `terms_conditions` LONGTEXT,
  `advance_references` LONGTEXT COMMENT 'JSON array of advance references',

  `invoice_id` BIGINT,

  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_invoice_id` (`invoice_id`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


--
-- Table: voucher_payment_single
--
CREATE TABLE IF NOT EXISTS `voucher_payment_single` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `date` date NOT NULL,
  `voucher_type` varchar(100) DEFAULT NULL,
  `voucher_number` varchar(100) NOT NULL,
  `pay_from_ledger_id` bigint NOT NULL,
  `pay_to_ledger_id` bigint NOT NULL,
  `total_payment` decimal(15,2) DEFAULT '0.00',
  `advance_ref_no` varchar(100) DEFAULT NULL,
  `advance_amount` decimal(15,2) DEFAULT '0.00',
  `transaction_details` json DEFAULT NULL COMMENT 'List: [{date, referenceNumber, amount, payment, pending, advance}]',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `bank_reconciled` tinyint(1) NOT NULL DEFAULT '0',
  `bank_reconcile_date` date DEFAULT NULL,
  `bank_statement_id` bigint DEFAULT NULL,
  `bank_reference_number` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `voucher_payment_single_tenant_id_idx` (`tenant_id`),
  KEY `voucher_payment_single_date_idx` (`date`),
  CONSTRAINT `voucher_payment_single_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vps_pay_from` FOREIGN KEY (`pay_from_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_vps_pay_to` FOREIGN KEY (`pay_to_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table: voucher_payment_bulk
--
CREATE TABLE IF NOT EXISTS `voucher_payment_bulk` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `date` date NOT NULL,
  `voucher_number` varchar(100) NOT NULL,
  `pay_from_ledger_id` bigint NOT NULL,
  `payment_rows` json DEFAULT NULL,
  `posting_note` longtext,
  `advance_ref_no` varchar(100) DEFAULT NULL,
  `advance_amount` decimal(15,2) DEFAULT '0.00',
  `transaction_details` json DEFAULT NULL COMMENT 'List: [{date, invoiceNo, amount, payNow, pending, advance}]',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `bank_reconciled` tinyint(1) NOT NULL DEFAULT '0',
  `bank_reconcile_date` date DEFAULT NULL,
  `bank_statement_id` bigint DEFAULT NULL,
  `bank_reference_number` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `voucher_payment_bulk_tenant_id_idx` (`tenant_id`),
  KEY `voucher_payment_bulk_date_idx` (`date`),
  CONSTRAINT `voucher_payment_bulk_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vpb_pay_from` FOREIGN KEY (`pay_from_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


--
-- Table: voucher_expenses
--
CREATE TABLE IF NOT EXISTS `voucher_expenses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `date` date NOT NULL,
  `voucher_number` varchar(100) NOT NULL,
  `expense_rows` json NOT NULL,
  `posting_note` longtext,
  `uploaded_files` json DEFAULT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `voucher_expenses_tenant_id_idx` (`tenant_id`),
  KEY `voucher_expenses_date_idx` (`date`),
  CONSTRAINT `voucher_expenses_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `voucher_contra` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `date` DATE NOT NULL,
  `voucher_number` VARCHAR(100) NOT NULL,
  `from_account` VARCHAR(255) NOT NULL,
  `to_account` VARCHAR(255) NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `narration` LONGTEXT,
  PRIMARY KEY (`id`),
  INDEX `idx_voucher_contra_tenant` (`tenant_id`),
  INDEX `idx_voucher_contra_voucher` (`voucher_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `voucher_journal` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `date` DATE NOT NULL,
  `voucher_number` VARCHAR(100) NOT NULL,
  `total_debit` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_credit` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `narration` LONGTEXT,
  `entries` JSON NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_voucher_journal_tenant` (`tenant_id`),
  INDEX `idx_voucher_journal_voucher` (`voucher_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE voucher_purchase_supplier_details (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id VARCHAR(36) NOT NULL,
  created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `date` DATE NOT NULL,
  supplier_invoice_no VARCHAR(100),
  supplier_invoice_date DATE,
  purchase_voucher_no VARCHAR(100),
  vendor_name VARCHAR(255),
  gstin VARCHAR(50),
  grn_reference VARCHAR(100),
  bill_from LONGTEXT,
  ship_from LONGTEXT,
  input_type VARCHAR(50),
  invoice_in_foreign_currency VARCHAR(10),
  supporting_document VARCHAR(100),
  PRIMARY KEY (id),
  KEY idx_vpsd_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE voucher_purchase_due_details (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id VARCHAR(36) NOT NULL,
  created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  tds_gst DECIMAL(15,2) DEFAULT 0.00,
  tds_it DECIMAL(15,2) DEFAULT 0.00,
  advance_paid DECIMAL(15,2) DEFAULT 0.00,
  to_pay DECIMAL(15,2) DEFAULT 0.00,
  posting_note LONGTEXT,
  terms VARCHAR(255),
  advance_references JSON,
  supplier_details_id BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_vpdd_tenant (tenant_id),
  KEY idx_vpdd_supplier (supplier_details_id),
  CONSTRAINT fk_vpdd_supplier
    FOREIGN KEY (supplier_details_id)
    REFERENCES voucher_purchase_supplier_details(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE voucher_purchase_supply_foreign_details (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id VARCHAR(36) NOT NULL,
  created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  purchase_order_no VARCHAR(100),
  exchange_rate DECIMAL(10,4),
  description LONGTEXT,
  items JSON,
  supplier_details_id BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_vpsfd_tenant (tenant_id),
  KEY idx_vpsfd_supplier (supplier_details_id),
  CONSTRAINT fk_vpsfd_supplier
    FOREIGN KEY (supplier_details_id)
    REFERENCES voucher_purchase_supplier_details(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE voucher_purchase_supply_inr_details (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id VARCHAR(36) NOT NULL,
  created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  purchase_order_no VARCHAR(100),
  purchase_ledger VARCHAR(255),
  items JSON,
  supplier_details_id BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_vpsid_tenant (tenant_id),
  KEY idx_vpsid_supplier (supplier_details_id),
  CONSTRAINT fk_vpsid_supplier
    FOREIGN KEY (supplier_details_id)
    REFERENCES voucher_purchase_supplier_details(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE voucher_purchase_transit_details (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id VARCHAR(36) NOT NULL,
  created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  mode VARCHAR(50),
  received_in VARCHAR(255),
  receipt_date DATE,
  receipt_time TIME(6),
  received_quantity VARCHAR(50),
  uqc VARCHAR(50),
  delivery_type VARCHAR(100),
  self_third_party VARCHAR(100),
  transporter_id VARCHAR(100),
  transporter_name VARCHAR(255),
  vehicle_no VARCHAR(100),
  lr_gr_consignment VARCHAR(100),
  document VARCHAR(100),
  extra_details JSON,
  supplier_details_id BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_vptd_tenant (tenant_id),
  KEY idx_vptd_supplier (supplier_details_id),
  CONSTRAINT fk_vptd_supplier
    FOREIGN KEY (supplier_details_id)
    REFERENCES voucher_purchase_supplier_details(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inventory_master_grn (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id VARCHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    name VARCHAR(255) NOT NULL,
    grn_type VARCHAR(100) NOT NULL,
    prefix VARCHAR(50),
    suffix VARCHAR(50),
    `year` CHAR(4),
    required_digits INT NOT NULL DEFAULT 0,
    preview VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    KEY idx_img_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE inventory_master_issueslip (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id VARCHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    name VARCHAR(255) NOT NULL,
    issue_slip_type VARCHAR(100) NOT NULL,
    prefix VARCHAR(50),
    suffix VARCHAR(50),
    `year` CHAR(4),
    required_digits INT NOT NULL DEFAULT 0,
    preview VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    KEY idx_imi_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- INVENTORY OPERATIONS SCHEMA
-- Stores various inventory operations like Job Work, Inter-Unit,
-- Location Change, Production, Consumption, Scrap, GRN, and Outward
-- Uses JSON 'items' column for detailed line items
-- ============================================================================

-- 1. JOB WORK 
-- Handles both "Goods sent for Jobwork" (Outward) and "Receipt of goods sent for Jobwork" (Receipt)

CREATE TABLE IF NOT EXISTS `inventory_operation_jobwork` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` CHAR(36) NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  
  -- Operation Type
  `operation_type` ENUM('outward', 'receipt') NOT NULL COMMENT 'outward: Goods sent, receipt: Goods received back',
  
  -- Common Fields
  `transaction_date` DATE DEFAULT NULL COMMENT 'Date of operation (issueSlipDate)',
  `transaction_time` TIME DEFAULT NULL COMMENT 'Time of operation (issueSlipTime)',
  `location_id` BIGINT DEFAULT NULL COMMENT 'Issued From / Received At Location (goodsFromLocation)',
  
  -- Jobwork Outward Specific Fields
  `job_work_outward_no` VARCHAR(50) DEFAULT NULL COMMENT 'Jobwork Outward No (issueSlipNumber)',
  `po_reference_no` VARCHAR(50) DEFAULT NULL COMMENT 'Purchase Order Reference No (jobWorkOrderNo)',
  
  -- Jobwork Receipt Specific Fields
  `job_work_receipt_no` VARCHAR(50) DEFAULT NULL COMMENT 'Job work Receipt No (jobWorkReceiptNo)',
  `related_outward_no` VARCHAR(50) DEFAULT NULL COMMENT 'Reference to Job Work Outward No (jobWorkOutwardRefNo)',
  `vendor_delivery_challan_no` VARCHAR(50) DEFAULT NULL COMMENT 'Vendor Return Delivery Challan No (vendorDeliveryChallan)',
  `supplier_invoice_no` VARCHAR(50) DEFAULT NULL COMMENT 'Supplier Invoice No (outwardSupplierInvoice)',
  
  -- Vendor / Job Worker Details
  `vendor_id` BIGINT DEFAULT NULL COMMENT 'Vendor ID',
  `vendor_name` VARCHAR(255) DEFAULT NULL COMMENT 'Vendor Name',
  `vendor_branch` VARCHAR(255) DEFAULT NULL COMMENT 'Vendor Branch',
  `vendor_address` TEXT DEFAULT NULL COMMENT 'Vendor Address',
  `vendor_gstin` VARCHAR(20) DEFAULT NULL COMMENT 'Vendor GSTIN',
  
  -- Items stored as JSON
  `items` JSON DEFAULT NULL COMMENT 'List of items: item_id, item_code, item_name, uom, quantity, rate, taxable_value, consumed_qty, etc.',

  `delivery_challan` JSON DEFAULT NULL,
  `eway_bill_details` JSON DEFAULT NULL,
  `dispatch_from` TEXT DEFAULT NULL,
  `mode_of_transport` VARCHAR(100) DEFAULT NULL,
  `dispatch_date` DATE DEFAULT NULL,
  `dispatch_time` TIME DEFAULT NULL,
  `delivery_type` VARCHAR(100) DEFAULT NULL,
  `transporter_id` VARCHAR(100) DEFAULT NULL,
  `transporter_name` VARCHAR(255) DEFAULT NULL,
  `vehicle_no` VARCHAR(100) DEFAULT NULL,
  `lr_gr_consignment` VARCHAR(100) DEFAULT NULL,
  
  -- Additional Info
  `posting_note` TEXT DEFAULT NULL COMMENT 'Posting Note',
  
  -- System Fields
  `status` VARCHAR(50) DEFAULT 'Draft' COMMENT 'Status: Draft, Posted, Cancelled',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` VARCHAR(100) DEFAULT NULL,
  `updated_by` VARCHAR(100) DEFAULT NULL,


  
  PRIMARY KEY (`id`),
  KEY `idx_jobwork_tenant` (`tenant_id`),
  KEY `idx_jobwork_operation_type` (`operation_type`),
  KEY `idx_jobwork_outward_no` (`job_work_outward_no`),
  KEY `idx_jobwork_receipt_no` (`job_work_receipt_no`),
  KEY `idx_jobwork_vendor` (`vendor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Inventory Jobwork Operations';


-- 2. INTER-UNIT TRANSFER 

CREATE TABLE IF NOT EXISTS `inventory_operation_interunit` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` VARCHAR(100) NOT NULL,
  `date` DATE NULL,
  `time` TIME NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'Draft',
  `goods_from_location` VARCHAR(255) NULL,
  `goods_to_location` VARCHAR(255) NULL,
  `posting_note` TEXT NULL,
  
  `irn` VARCHAR(255) DEFAULT NULL,
  `ack_no` VARCHAR(100) DEFAULT NULL,

  `items` JSON DEFAULT NULL COMMENT 'List of items: item_code, quantity, rate, value, etc.',
  
  `delivery_challan` JSON DEFAULT NULL,
  `eway_bill_details` JSON DEFAULT NULL,
  `dispatch_from` TEXT DEFAULT NULL,
  `mode_of_transport` VARCHAR(100) DEFAULT NULL,
  `dispatch_date` DATE DEFAULT NULL,
  `dispatch_time` TIME DEFAULT NULL,
  `delivery_type` VARCHAR(100) DEFAULT NULL,
  `transporter_id` VARCHAR(100) DEFAULT NULL,
  `transporter_name` VARCHAR(255) DEFAULT NULL,
  `vehicle_no` VARCHAR(100) DEFAULT NULL,
  `lr_gr_consignment` VARCHAR(100) DEFAULT NULL,



  PRIMARY KEY (`id`),
  KEY `idx_ioi_tenant` (`tenant_id`),
  KEY `idx_ioi_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3. LOCATION CHANGE 

CREATE TABLE IF NOT EXISTS `inventory_operation_locationchange` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` VARCHAR(100) NOT NULL,
  `date` DATE NULL,
  `time` TIME NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'Draft',
  `goods_from_location` VARCHAR(255) NULL,
  `goods_to_location` VARCHAR(255) NULL,
  `posting_note` TEXT NULL,
  
  `items` JSON DEFAULT NULL COMMENT 'List of items: item_code, quantity, rate, value, etc.',
  
  `delivery_challan` JSON DEFAULT NULL,
  `eway_bill_details` JSON DEFAULT NULL,
  `dispatch_from` TEXT DEFAULT NULL,
  `mode_of_transport` VARCHAR(100) DEFAULT NULL,
  `dispatch_date` DATE DEFAULT NULL,
  `dispatch_time` TIME DEFAULT NULL,
  `delivery_type` VARCHAR(100) DEFAULT NULL,
  `transporter_id` VARCHAR(100) DEFAULT NULL,
  `transporter_name` VARCHAR(255) DEFAULT NULL,
  `vehicle_no` VARCHAR(100) DEFAULT NULL,
  `lr_gr_consignment` VARCHAR(100) DEFAULT NULL,



  PRIMARY KEY (`id`),
  KEY `idx_iolc_tenant` (`tenant_id`),
  KEY `idx_iolc_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 4. PRODUCTION 

CREATE TABLE IF NOT EXISTS `inventory_operation_production` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` VARCHAR(100) NOT NULL,
  `date` DATE NULL,
  `time` TIME NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'Draft',
  `goods_from_location` VARCHAR(255) NULL,
  `goods_to_location` VARCHAR(255) NULL,
  `posting_note` TEXT NULL,
  
  -- Production Specifics
  `production_type` VARCHAR(50) DEFAULT 'materials_issued' COMMENT 'materials_issued, inter_process, finished_goods',
  `material_issue_slip_no` VARCHAR(100) DEFAULT NULL,
  `process_transfer_slip_no` VARCHAR(100) DEFAULT NULL,
  `finished_goods_production_no` VARCHAR(100) DEFAULT NULL,
  `batch_no` VARCHAR(50) DEFAULT NULL,
  `expiry_date` DATE DEFAULT NULL,

  `items` JSON DEFAULT NULL COMMENT 'List of items with type (input/output/waste), quantity, rate, etc.',

  `delivery_challan` JSON DEFAULT NULL,
  `eway_bill_details` JSON DEFAULT NULL,
  `dispatch_from` TEXT DEFAULT NULL,
  `mode_of_transport` VARCHAR(100) DEFAULT NULL,
  `dispatch_date` DATE DEFAULT NULL,
  `dispatch_time` TIME DEFAULT NULL,
  `delivery_type` VARCHAR(100) DEFAULT NULL,
  `transporter_id` VARCHAR(100) DEFAULT NULL,
  `transporter_name` VARCHAR(255) DEFAULT NULL,
  `vehicle_no` VARCHAR(100) DEFAULT NULL,
  `lr_gr_consignment` VARCHAR(100) DEFAULT NULL,



  PRIMARY KEY (`id`),
  KEY `idx_iop_tenant` (`tenant_id`),
  KEY `idx_iop_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 5. CONSUMPTION 

CREATE TABLE IF NOT EXISTS `inventory_operation_consumption` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` VARCHAR(100) NOT NULL,
  `date` DATE NULL,
  `time` TIME NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'Draft',
  `goods_from_location` VARCHAR(255) NULL,
  `goods_to_location` VARCHAR(255) NULL,
  `posting_note` TEXT NULL,
  
  `items` JSON DEFAULT NULL COMMENT 'List of items: item_code, quantity, rate, etc.',
  
  `delivery_challan` JSON DEFAULT NULL,
  `eway_bill_details` JSON DEFAULT NULL,
  `dispatch_from` TEXT DEFAULT NULL,
  `mode_of_transport` VARCHAR(100) DEFAULT NULL,
  `dispatch_date` DATE DEFAULT NULL,
  `dispatch_time` TIME DEFAULT NULL,
  `delivery_type` VARCHAR(100) DEFAULT NULL,
  `transporter_id` VARCHAR(100) DEFAULT NULL,
  `transporter_name` VARCHAR(255) DEFAULT NULL,
  `vehicle_no` VARCHAR(100) DEFAULT NULL,
  `lr_gr_consignment` VARCHAR(100) DEFAULT NULL,



  PRIMARY KEY (`id`),
  KEY `idx_ioc_tenant` (`tenant_id`),
  KEY `idx_ioc_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 6. SCRAP 

CREATE TABLE IF NOT EXISTS `inventory_operation_scrap` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` VARCHAR(100) NOT NULL,
  `date` DATE NULL,
  `time` TIME NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'Draft',
  `goods_from_location` VARCHAR(255) NULL,
  `goods_to_location` VARCHAR(255) NULL,
  `posting_note` TEXT NULL,
  
  `items` JSON DEFAULT NULL COMMENT 'List of items: item_code, quantity, value, etc.',
  
  `delivery_challan` JSON DEFAULT NULL,
  `eway_bill_details` JSON DEFAULT NULL,
  `dispatch_from` TEXT DEFAULT NULL,
  `mode_of_transport` VARCHAR(100) DEFAULT NULL,
  `dispatch_date` DATE DEFAULT NULL,
  `dispatch_time` TIME DEFAULT NULL,
  `delivery_type` VARCHAR(100) DEFAULT NULL,
  `transporter_id` VARCHAR(100) DEFAULT NULL,
  `transporter_name` VARCHAR(255) DEFAULT NULL,
  `vehicle_no` VARCHAR(100) DEFAULT NULL,
  `lr_gr_consignment` VARCHAR(100) DEFAULT NULL,



  PRIMARY KEY (`id`),
  KEY `idx_ios_tenant` (`tenant_id`),
  KEY `idx_ios_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 7. NEW GRN (Goods Receipt Note) 

CREATE TABLE IF NOT EXISTS `inventory_operation_new_grn` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  
  `grn_type` VARCHAR(50) DEFAULT 'purchases' COMMENT 'purchases, sales_return',
  `grn_no` VARCHAR(100) DEFAULT NULL,
  `date` DATE DEFAULT NULL,
  `time` TIME DEFAULT NULL,
  
  `location_id` BIGINT DEFAULT NULL, 
  
  -- Party Details (Vendor or Customer)
  `vendor_name` VARCHAR(255) DEFAULT NULL,
  `customer_name` VARCHAR(255) DEFAULT NULL,
  `branch` VARCHAR(255) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `gstin` VARCHAR(50) DEFAULT NULL,
  
  -- References
  `reference_no` VARCHAR(100) DEFAULT NULL COMMENT 'PO No or Sales Voucher No',
  `secondary_ref_no` VARCHAR(100) DEFAULT NULL COMMENT 'Supplier Inv No or Debit Note No',
  
  -- Sales Return Specific
  `return_reason` TEXT DEFAULT NULL,
  
  -- Common
  `posting_note` TEXT DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'Posted',
  
  `items` JSON DEFAULT NULL COMMENT 'List of items: item_code, uom, received_qty, accepted_qty, etc.',
  
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 8. OUTWARD 

CREATE TABLE IF NOT EXISTS `inventory_operation_outward` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `outward_slip_no` VARCHAR(100) NOT NULL,
  `date` DATE NULL,
  `time` TIME NULL,
  `outward_type` VARCHAR(50) NOT NULL DEFAULT 'sales' COMMENT 'sales or purchase_return',
  `location_id` BIGINT NULL,
  `sales_order_no` VARCHAR(100) NULL,
  `customer_name` VARCHAR(255) NULL,
  `supplier_invoice_no` VARCHAR(100) NULL,
  `vendor_name` VARCHAR(255) NULL,
  `branch` VARCHAR(100) NULL,
  `address` TEXT NULL,
  `gstin` VARCHAR(20) NULL,
  `total_boxes` VARCHAR(50) NULL,
  `posting_note` TEXT NULL,
  
  `items` JSON DEFAULT NULL COMMENT 'List of items: item_code, quantity, hsn, etc.',

  `delivery_challan` JSON DEFAULT NULL,
  `eway_bill_details` JSON DEFAULT NULL,
  `dispatch_from` TEXT DEFAULT NULL,
  `mode_of_transport` VARCHAR(100) DEFAULT NULL,
  `dispatch_date` DATE DEFAULT NULL,
  `dispatch_time` TIME DEFAULT NULL,
  `delivery_type` VARCHAR(100) DEFAULT NULL,
  `transporter_id` VARCHAR(100) DEFAULT NULL,
  `transporter_name` VARCHAR(255) DEFAULT NULL,
  `vehicle_no` VARCHAR(100) DEFAULT NULL,
  `lr_gr_consignment` VARCHAR(100) DEFAULT NULL,



  PRIMARY KEY (`id`),
  KEY `idx_ioo_tenant` (`tenant_id`),
  KEY `idx_ioo_outward_slip` (`outward_slip_no`),
  KEY `idx_ioo_location` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 9. (LEGACY) GRN - REMOVED
-- This table has been deprecated and replaced by inventory_operation_new_grn
-- The old table used location as ForeignKey, the new table uses location_id as BigInt



CREATE TABLE service_group (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    category VARCHAR(100) NOT NULL,
    `group` VARCHAR(100) NOT NULL DEFAULT '',
    `subgroup` VARCHAR(100) NOT NULL DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;

CREATE TABLE service_list (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,

    service_code VARCHAR(50) NOT NULL,
    service_name VARCHAR(255) NOT NULL,

    service_group VARCHAR(100),

    sac_code VARCHAR(20),
    gst_rate DECIMAL(5,2) DEFAULT 0.00,
    expense_ledger VARCHAR(255),
    uom VARCHAR(50),
    description LONGTEXT,

    is_active BOOLEAN DEFAULT TRUE,

    created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    INDEX idx_tenant (tenant_id),
    INDEX idx_service_code (service_code),
    INDEX idx_service_group (service_group)
) ENGINE=InnoDB;

-- Table: extracted_invoices
CREATE TABLE IF NOT EXISTS `extracted_invoices` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    
    -- General Details
    `voucher_date` VARCHAR(20),
    `invoice_number` VARCHAR(100),
    `po_number` VARCHAR(100),
    `po_date` VARCHAR(20),
    
    -- Supplier Details
    `supplier_name` VARCHAR(255),
    `bill_from_address` TEXT,
    `ship_from_address` TEXT,
    `email` VARCHAR(255),
    `phone` VARCHAR(100),
    `sales_person` VARCHAR(255),
    `gstin` VARCHAR(15),
    `pan` VARCHAR(10),
    `msme_number` VARCHAR(50),
    `payment_terms` VARCHAR(255),
    `delivery_terms` VARCHAR(255),
    
    -- Ledger Details
    `ledger_amount` VARCHAR(50),
    `ledger_rate` VARCHAR(50),
    `ledger_amount_dr_cr` VARCHAR(10),
    `ledger_narration` TEXT,
    `description_of_ledger` TEXT,
    `type_of_tax_payment` VARCHAR(100),
    
    -- Item Details
    `item_code` VARCHAR(100),
    `item_description` TEXT,
    `quantity` VARCHAR(50),
    `quantity_uom` VARCHAR(50),
    `item_rate` VARCHAR(50),
    `disc_pct` VARCHAR(50),
    `item_amount` VARCHAR(50),
    `marks` VARCHAR(255),
    `no_of_packages` VARCHAR(50),
    `freight_charges` VARCHAR(50),
    
    -- HSN/SAC
    `hsn_sac_details` VARCHAR(20),
    
    -- GST Details
    `gst_rate` VARCHAR(50),
    `igst_amount` VARCHAR(50),
    `cgst_amount` VARCHAR(50),
    `sgst_utgst_amount` VARCHAR(50),
    `cess_rate` VARCHAR(50),
    `cess_amount` VARCHAR(50),
    `state_cess_rate` VARCHAR(50),
    `state_cess_amount` VARCHAR(50),
    `applicable_for_reverse_charge` VARCHAR(10),
    `taxable_value` VARCHAR(50),
    `invoice_value` VARCHAR(50),
    
    -- Flexible Storage
    `additional_fields` JSON,
    
    INDEX `idx_extracted_tenant` (`tenant_id`),
    INDEX `idx_extracted_invoice` (`invoice_number`),
    INDEX `idx_extracted_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


ALTER TABLE users
ADD COLUMN subscription_start_date DATE NULL;

-- Table: rbac_roles

CREATE TABLE IF NOT EXISTS `rbac_roles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `name` varchar(100) NOT NULL COMMENT 'Role name (e.g., Accountant)',
  `description` longtext COMMENT 'Role description',
  `permissions` json NOT NULL COMMENT 'Hierarchical permissions structure (page -> tabs)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this role is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_roles_tenant_name_unique` (`tenant_id`,`name`),
  KEY `rbac_roles_tenant_id_idx` (`tenant_id`),
  CONSTRAINT `rbac_roles_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RBAC Roles';


-- Table: rbac_user_roles

CREATE TABLE IF NOT EXISTS `rbac_user_roles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `user_id` bigint NOT NULL COMMENT 'User assigned to this role',
  `role_id` bigint NOT NULL COMMENT 'Role assigned to the user',
  `username` varchar(150) DEFAULT NULL COMMENT 'Snapshot of username',
  `email` varchar(254) DEFAULT NULL COMMENT 'Snapshot of email',
  `phone` varchar(15) DEFAULT NULL COMMENT 'Snapshot of phone',
  `assigned_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'When role was assigned',
  `assigned_by_id` bigint DEFAULT NULL COMMENT 'Admin who assigned this role',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_user_roles_unique` (`user_id`,`role_id`,`tenant_id`),
  KEY `rbac_user_roles_tenant_id_idx` (`tenant_id`),
  KEY `rbac_user_roles_user_id_idx` (`user_id`),
  KEY `rbac_user_roles_role_id_idx` (`role_id`),
  KEY `rbac_user_roles_assigned_by_id_idx` (`assigned_by_id`),
  CONSTRAINT `rbac_user_roles_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rbac_user_roles_role_fk` FOREIGN KEY (`role_id`) REFERENCES `rbac_roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rbac_user_roles_assigned_by_fk` FOREIGN KEY (`assigned_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `rbac_user_roles_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RBAC User Role Assignments';





-- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

-- Updates for Customer Master Schema (2026-02-20)
-- Add TDS Applicable field to customer_master_customer_basicdetails
ALTER TABLE customer_master_customer_basicdetails 
ADD COLUMN gst_tds_applicable BOOLEAN DEFAULT FALSE,
ADD COLUMN billing_currency VARCHAR(10) NULL;

-- Add individual address fields to customer_master_customer_gstdetails
ALTER TABLE customer_master_customer_gstdetails
ADD COLUMN address_line_1 VARCHAR(255) NULL,
ADD COLUMN address_line_2 VARCHAR(255) NULL,
ADD COLUMN address_line_3 VARCHAR(255) NULL,
ADD COLUMN city VARCHAR(100) NULL,
ADD COLUMN state VARCHAR(100) NULL,
ADD COLUMN country VARCHAR(100) NULL,
ADD COLUMN pincode VARCHAR(20) NULL;

-- Updates for Inventory Operation Schema (2026-02-21)
ALTER TABLE `inventory_operation_new_grn`
ADD COLUMN `grn_series_name` VARCHAR(255) DEFAULT NULL AFTER `grn_no`;

-- Updates to prevent duplication in category tables (2026-02-21)
UPDATE `inventory_master_category` SET `group` = '' WHERE `group` IS NULL;
UPDATE `inventory_master_category` SET `subgroup` = '' WHERE `subgroup` IS NULL;
ALTER TABLE `inventory_master_category` 
MODIFY COLUMN `group` VARCHAR(255) NOT NULL DEFAULT '',
MODIFY COLUMN `subgroup` VARCHAR(255) NOT NULL DEFAULT '';

UPDATE `vendor_master_category` SET `group` = '' WHERE `group` IS NULL;
UPDATE `vendor_master_category` SET `subgroup` = '' WHERE `subgroup` IS NULL;
ALTER TABLE `vendor_master_category` 
MODIFY COLUMN `group` VARCHAR(255) NOT NULL DEFAULT '',
MODIFY COLUMN `subgroup` VARCHAR(255) NOT NULL DEFAULT '';

UPDATE `customer_master_category` SET `group` = '' WHERE `group` IS NULL;
UPDATE `customer_master_category` SET `subgroup` = '' WHERE `subgroup` IS NULL;
ALTER TABLE `customer_master_category` 
MODIFY COLUMN `group` VARCHAR(255) NOT NULL DEFAULT '',
MODIFY COLUMN `subgroup` VARCHAR(255) NOT NULL DEFAULT '';

UPDATE `service_group` SET `group` = '' WHERE `group` IS NULL;
UPDATE `service_group` SET `subgroup` = '' WHERE `subgroup` IS NULL;
ALTER TABLE `service_group` 
MODIFY COLUMN `group` VARCHAR(100) NOT NULL DEFAULT '',
MODIFY COLUMN `subgroup` VARCHAR(100) NOT NULL DEFAULT '';

-- Remove ghost placeholder rows created by "ensure root exists" logic (2026-02-21)
-- These rows (group='', subgroup='') were inserted as side-effects and are never
-- used by the UI tree (which builds roots from systemCategories constants).
DELETE FROM `inventory_master_category` WHERE `group` = '' AND `subgroup` = '';
DELETE FROM `vendor_master_category`    WHERE `group` = '' AND `subgroup` = '';
DELETE FROM `customer_master_category`  WHERE `group` = '' AND `subgroup` = '';
DELETE FROM `service_group`             WHERE `group` = '' AND `subgroup` = '';

-----------------------------------------------------


CREATE TABLE IF NOT EXISTS `gst_apiusagelog` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `api_name` VARCHAR(255) NOT NULL,
  `request_data` JSON,
  `response_status` INT,
  `response_data` JSON,
  `error_message` TEXT,
  `created_at` DATETIME(6),
  KEY `gst_apiusagelog_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `password_reset_otps` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `otp_hash` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME(6) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `used` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL,
  CONSTRAINT `password_reset_otps_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `extraction_performance` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `file_count` INT NOT NULL DEFAULT 1,
  `processing_time_seconds` DOUBLE NOT NULL,
  `timestamp` DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `voucher_purchase_supply_inr_details` ADD COLUMN `description` LONGTEXT NULL;

ALTER TABLE `voucher_purchase_supply_foreign_details` ADD COLUMN `purchase_ledger` VARCHAR(255) NULL;

-- Purchase Voucher - Adding missing Vendor Relationship and Creation Source
-- These ALTER queries ensure the schema matches the current state of the database and models
ALTER TABLE `voucher_purchase_supplier_details` ADD COLUMN `vendor_basic_detail_id` BIGINT NOT NULL, ADD COLUMN `creation_source` VARCHAR(50) DEFAULT 'manual';
ALTER TABLE `voucher_purchase_supplier_details` ADD COLUMN `purchase_voucher_series` VARCHAR(100) NULL AFTER `supplier_invoice_no`;
ALTER TABLE `voucher_purchase_supplier_details` ADD COLUMN `branch` VARCHAR(255) NULL AFTER `gstin`;
ALTER TABLE `voucher_purchase_supplier_details` ADD CONSTRAINT `fk_vpsd_vendor` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE;



ALTER TABLE voucher_purchase_transit_details

ADD COLUMN upto_port_origin_city VARCHAR(255),
ADD COLUMN upto_port_origin_country VARCHAR(100),
ADD COLUMN upto_port_vessel_flight_no VARCHAR(100),
ADD COLUMN upto_port_port_of_loading VARCHAR(255),
ADD COLUMN upto_port_port_of_discharge VARCHAR(255),
ADD COLUMN upto_port_final_dest_city VARCHAR(255),
ADD COLUMN upto_port_final_dest_country VARCHAR(100),
ADD COLUMN upto_port_rr_no VARCHAR(100),
ADD COLUMN upto_port_rr_date DATE,
ADD COLUMN upto_port_fnr_no VARCHAR(100),
ADD COLUMN upto_port_station_loading VARCHAR(255),
ADD COLUMN upto_port_station_discharge VARCHAR(255),

ADD COLUMN beyond_port_sb_no VARCHAR(100),
ADD COLUMN beyond_port_sb_date DATE,
ADD COLUMN beyond_port_ship_port_code VARCHAR(100),
ADD COLUMN beyond_port_vessel_flight_no VARCHAR(100),
ADD COLUMN beyond_port_port_of_loading VARCHAR(255),
ADD COLUMN beyond_port_port_of_discharge VARCHAR(255),
ADD COLUMN beyond_port_final_dest VARCHAR(255),
ADD COLUMN beyond_port_dest_country VARCHAR(100),
ADD COLUMN beyond_port_origin_country VARCHAR(100),

ADD COLUMN rail_beyond_rr_no VARCHAR(100),
ADD COLUMN rail_beyond_origin VARCHAR(255),
ADD COLUMN rail_beyond_rr_date DATE,
ADD COLUMN rail_beyond_rail_no VARCHAR(100),
ADD COLUMN rail_beyond_station_loading VARCHAR(255),
ADD COLUMN rail_beyond_origin_country VARCHAR(100),
ADD COLUMN rail_beyond_station_discharge VARCHAR(255),
ADD COLUMN rail_beyond_final_dest VARCHAR(255),
ADD COLUMN rail_beyond_dest_country VARCHAR(100),

ADD COLUMN rail_upto_delivery_type VARCHAR(100),
ADD COLUMN rail_upto_transporter_name VARCHAR(255),
ADD COLUMN rail_upto_transporter_id VARCHAR(100);

CREATE TABLE IF NOT EXISTS invoice_ocr_temp (
    id BIGINT NOT NULL AUTO_INCREMENT,

    file_hash VARCHAR(64) NOT NULL,       -- SHA-256 hex of uploaded bytes
    tenant_id VARCHAR(64) NOT NULL,       -- Tenant isolation

    file_path VARCHAR(512) NOT NULL,      -- Uploaded file path / filename

    ocr_raw_text LONGTEXT DEFAULT NULL,   -- Raw OCR output
    extracted_data JSON DEFAULT NULL,     -- Structured invoice JSON

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,         -- created_at + 15 days

    PRIMARY KEY (id),

    UNIQUE KEY uniq_hash_tenant (file_hash, tenant_id),

    INDEX idx_ocr_temp_expires (expires_at)

) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

ALTER TABLE customer_master_customer_productservice ADD COLUMN packing_notes TEXT DEFAULT NULL;

-- Updates for Sales Customer Validation and Bulk Scan Staging
ALTER TABLE `invoice_ocr_temp` 
    ADD COLUMN `upload_session_id` VARCHAR(255) DEFAULT NULL,
    ADD COLUMN `processed` BOOLEAN DEFAULT FALSE,
    ADD COLUMN `validation_status` VARCHAR(50) DEFAULT 'PENDING',
    ADD COLUMN `matched_by` VARCHAR(50) DEFAULT NULL,
    ADD COLUMN `conflict_message` TEXT DEFAULT NULL,
    ADD COLUMN `vendor_id` BIGINT DEFAULT NULL,
    ADD COLUMN `voucher_id` BIGINT DEFAULT NULL;

-- ============================================================
-- Bank Statement Staging and Reconciliation Tables
-- Tally-style architecture: Upload → Stage → Match → Reconcile
-- Voucher creation is NEVER automatic during upload.
-- ============================================================

CREATE TABLE IF NOT EXISTS `bank_statement_transactions` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` char(36) NOT NULL,
    `bank_ledger_id` bigint NOT NULL COMMENT 'FK to master_ledgers (Bank/Cash ledger)',
    `transaction_date` date NOT NULL COMMENT 'Date of bank transaction',
    `narration` longtext COMMENT 'Transaction description/narration',
    `debit` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Debit amount (money out)',
    `credit` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Credit amount (money in)',
    `reference_number` varchar(100) DEFAULT NULL COMMENT 'Cheque No / UTR / Transaction ID',
    `cheque_number` varchar(100) DEFAULT NULL COMMENT 'Extracted cheque number',
    `running_balance` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Statement running balance',
    `import_batch_id` varchar(100) DEFAULT NULL COMMENT 'Batch ID for the upload session',
    `match_status` varchar(20) NOT NULL DEFAULT 'Unmatched'
        COMMENT 'Matched | Possible Match | Unmatched | Ignored',
    `matched_voucher_id` bigint DEFAULT NULL COMMENT 'FK to vouchers.id when matched',
    `confidence_score` int DEFAULT 0 COMMENT 'Match confidence score (0-100)',
    `match_method` varchar(50) DEFAULT NULL COMMENT 'How the match was achieved',
    `multi_voucher_ids` json DEFAULT NULL COMMENT 'JSON array of voucher IDs for multi-match',
    `suggested_party` varchar(255) DEFAULT NULL COMMENT 'Extracted party name from narration',
    `suggested_invoice` varchar(100) DEFAULT NULL COMMENT 'Extracted invoice number from narration',
    `suggested_voucher_type` varchar(20) DEFAULT NULL COMMENT 'Suggested voucher type (payment/receipt)',
    `is_ignored` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'User explicitly ignored this transaction',
    `reconciled_at` datetime(6) DEFAULT NULL COMMENT 'Timestamp when reconciled',
    `source` varchar(50) NOT NULL DEFAULT 'BANK_UPLOAD' COMMENT 'Source of transaction',
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_bank_stmt_txn` (`bank_ledger_id`,`transaction_date`,`reference_number`,`debit`,`credit`),
    KEY `idx_bank_st_tenant_ledger_status` (`tenant_id`, `bank_ledger_id`, `match_status`),
    KEY `idx_bank_st_tenant_date` (`tenant_id`, `transaction_date`),
    KEY `idx_bank_st_tenant` (`tenant_id`),
    CONSTRAINT `fk_bank_st_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Staging table for bank statement transactions. Populated on upload; vouchers NOT created here.';

-- ALTER queries to add newly introduced columns to existing environments:
-- ALTER TABLE `bank_statement_transactions`
--   ADD COLUMN IF NOT EXISTS `matched_voucher_id` bigint DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `confidence_score` int DEFAULT 0,
--   ADD COLUMN IF NOT EXISTS `match_method` varchar(50) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `multi_voucher_ids` json DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `suggested_party` varchar(255) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `suggested_invoice` varchar(100) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `suggested_voucher_type` varchar(20) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `reconciled_at` datetime(6) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `source` varchar(50) NOT NULL DEFAULT 'BANK_UPLOAD',
--   MODIFY COLUMN `match_status` varchar(20) NOT NULL DEFAULT 'Unmatched',
--   ADD INDEX IF NOT EXISTS `idx_bank_st_tenant_ledger_status` (`tenant_id`, `bank_ledger_id`, `match_status`),
--   ADD INDEX IF NOT EXISTS `idx_bank_st_tenant_date` (`tenant_id`, `transaction_date`);

CREATE TABLE IF NOT EXISTS `bank_reconciliation_links` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `tenant_id` char(36) NOT NULL,
    `bank_transaction_id` bigint NOT NULL COMMENT 'FK to bank_statement_transactions',
    `voucher_id` bigint NOT NULL COMMENT 'FK to vouchers.id',
    `reconciliation_date` date DEFAULT NULL COMMENT 'Date when reconciled',
    `reconciliation_status` varchar(20) NOT NULL DEFAULT 'Reconciled' COMMENT 'Reconciled | Pending | Disputed',
    `reconciliation_type` varchar(50) NOT NULL DEFAULT 'manual' COMMENT 'automatic | manual',
    `voucher_type` varchar(50) DEFAULT NULL,
    `confidence_score` int NOT NULL DEFAULT '0',
    `match_method` varchar(50) DEFAULT NULL,
    `reconciled_at` datetime(6) DEFAULT NULL,
    `cheque_number` varchar(100) DEFAULT NULL,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bank_transaction` (`bank_transaction_id`),
    KEY `idx_bank_rec_tenant` (`tenant_id`),
    KEY `idx_bank_rec_voucher` (`voucher_id`),
    CONSTRAINT `fk_bank_rec_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_bank_rec_transaction` FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_statement_transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Stores bank transaction → voucher reconciliation mappings. Separate from voucher tables.';

-- ALTER TABLE `bank_reconciliation_links`
--   ADD COLUMN IF NOT EXISTS `voucher_type` varchar(50) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `confidence_score` int NOT NULL DEFAULT '0',
--   ADD COLUMN IF NOT EXISTS `match_method` varchar(50) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `cheque_number` varchar(100) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `reconciled_at` datetime(6) DEFAULT NULL;

-- ============================================================================
-- Table: voucher_receipt_single
-- Single receipt voucher – receive_in & receive_from are FK to master_ledgers
-- ============================================================================
CREATE TABLE IF NOT EXISTS `voucher_receipt_single` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `date` date NOT NULL,
  `voucher_type` varchar(100) DEFAULT NULL,
  `voucher_number` varchar(100) NOT NULL,
  `total_receipt` decimal(15,2) NOT NULL DEFAULT '0.00',
  `advance_ref_no` varchar(100) DEFAULT NULL,
  `advance_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `transaction_details` json DEFAULT NULL COMMENT 'List: [{date, referenceNumber, amount, receipt, pending, advance}]',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `bank_reconciled` tinyint(1) NOT NULL DEFAULT '0',
  `bank_reconcile_date` date DEFAULT NULL,
  `bank_statement_id` bigint DEFAULT NULL,
  `bank_reference_number` varchar(100) DEFAULT NULL,
  `receive_in_ledger_id` bigint NOT NULL COMMENT 'FK to master_ledgers (Bank/Cash account)',
  `receive_from_ledger_id` bigint NOT NULL COMMENT 'FK to master_ledgers (Customer/Party)',
  PRIMARY KEY (`id`),
  KEY `voucher_receipt_single_tenant_id_idx` (`tenant_id`),
  KEY `voucher_receipt_single_date_idx` (`date`),
  KEY `fk_vrs_receive_in` (`receive_in_ledger_id`),
  KEY `fk_vrs_receive_from` (`receive_from_ledger_id`),
  CONSTRAINT `fk_vrs_receive_from` FOREIGN KEY (`receive_from_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_vrs_receive_in` FOREIGN KEY (`receive_in_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `voucher_receipt_single_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Single receipt vouchers. Debit: receive_in (Bank/Cash), Credit: receive_from (Customer).';

-- ============================================================================
-- Table: voucher_receipt_bulk
-- Bulk receipt voucher – receive_in is FK to master_ledgers; receipt_rows JSON
-- ============================================================================
CREATE TABLE IF NOT EXISTS `voucher_receipt_bulk` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `date` date NOT NULL,
  `voucher_number` varchar(100) NOT NULL,
  `receipt_rows` json DEFAULT NULL COMMENT 'List of {receiveFrom, amount}',
  `posting_note` longtext DEFAULT NULL,
  `advance_ref_no` varchar(100) DEFAULT NULL,
  `advance_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `transaction_details` json DEFAULT NULL COMMENT 'List: [{date, invoiceNo, amount, receiveNow, pending, advance}]',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `bank_reconciled` tinyint(1) NOT NULL DEFAULT '0',
  `bank_reconcile_date` date DEFAULT NULL,
  `bank_statement_id` bigint DEFAULT NULL,
  `bank_reference_number` varchar(100) DEFAULT NULL,
  `receive_in_ledger_id` bigint NOT NULL COMMENT 'FK to master_ledgers (Bank/Cash account)',
  PRIMARY KEY (`id`),
  KEY `voucher_receipt_bulk_tenant_id_idx` (`tenant_id`),
  KEY `voucher_receipt_bulk_date_idx` (`date`),
  KEY `fk_vrb_receive_in` (`receive_in_ledger_id`),
  CONSTRAINT `fk_vrb_receive_in` FOREIGN KEY (`receive_in_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `voucher_receipt_bulk_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Bulk receipt vouchers. One voucher can receive from multiple parties.';

CREATE TABLE journal_entries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    voucher_id BIGINT NOT NULL,
    ledger VARCHAR(255) NOT NULL,
    debit DECIMAL(15,2) DEFAULT 0.00,
    credit DECIMAL(15,2) DEFAULT 0.00,

    INDEX idx_voucher (voucher_id),
    INDEX idx_tenant (tenant_id)
);



-- Alter the customer_master_customer_productservice table by added a new column packing_notes
ALTER TABLE customer_master_customer_productservice
ADD COLUMN packing_notes VARCHAR(255) DEFAULT NULL COMMENT 'Packing Notes';



--Alter the customer_transaction_salesorder_items table by adding a new column packing_notes
ALTER TABLE customer_transaction_salesorder_items
ADD COLUMN packing_notes TEXT DEFAULT NULL COMMENT 'Packing Notes';