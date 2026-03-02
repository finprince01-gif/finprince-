-- ============================================================
-- missing_tables.sql
-- All tables listed in tables.txt but NOT present in schema.sql
-- Generated: 2026-02-28
-- ============================================================

-- ─── Django Built-in Tables ──────────────────────────────────

CREATE TABLE IF NOT EXISTS `django_content_type` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `app_label` VARCHAR(100) NOT NULL,
  `model` VARCHAR(100) NOT NULL,
  UNIQUE KEY `django_content_type_app_label_model` (`app_label`, `model`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `auth_permission` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `content_type_id` INT NOT NULL,
  `codename` VARCHAR(100) NOT NULL,
  UNIQUE KEY `auth_permission_content_type_id_codename` (`content_type_id`, `codename`),
  CONSTRAINT `auth_permission_content_type_id_fk` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `auth_group` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `auth_group_permissions` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `group_id` INT NOT NULL,
  `permission_id` INT NOT NULL,
  UNIQUE KEY `auth_group_permissions_group_id_permission_id` (`group_id`, `permission_id`),
  CONSTRAINT `auth_group_permissions_group_id_fk` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`),
  CONSTRAINT `auth_group_permissions_permission_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `auth_permission` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `django_admin_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `action_time` DATETIME(6) NOT NULL,
  `object_id` LONGTEXT,
  `object_repr` VARCHAR(200) NOT NULL,
  `action_flag` SMALLINT UNSIGNED NOT NULL,
  `change_message` LONGTEXT NOT NULL,
  `content_type_id` INT,
  `user_id` BIGINT NOT NULL,
  CONSTRAINT `django_admin_log_content_type_id_fk` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`),
  CONSTRAINT `django_admin_log_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `django_session` (
  `session_key` VARCHAR(40) NOT NULL PRIMARY KEY,
  `session_data` LONGTEXT NOT NULL,
  `expire_date` DATETIME(6) NOT NULL,
  KEY `django_session_expire_date` (`expire_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Core / Company Tables ────────────────────────────────────

CREATE TABLE IF NOT EXISTS `core_companyfullinfo` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `company_name` VARCHAR(255) NOT NULL,
  `address_line1` VARCHAR(255),
  `address_line2` VARCHAR(255),
  `city` VARCHAR(100),
  `state` VARCHAR(100),
  `pincode` VARCHAR(10),
  `country` VARCHAR(100) DEFAULT 'India',
  `phone` VARCHAR(15),
  `mobile` VARCHAR(15),
  `email` VARCHAR(255),
  `website` VARCHAR(255),
  `gstin` VARCHAR(15),
  `pan` VARCHAR(10),
  `cin` VARCHAR(21),
  `tan` VARCHAR(10),
  `business_type` VARCHAR(50),
  `industry_type` VARCHAR(100),
  `financial_year_start` DATE,
  `financial_year_end` DATE,
  `logo_path` VARCHAR(500),
  `signature_path` VARCHAR(500),
  `bank_name` VARCHAR(255),
  `bank_account_no` VARCHAR(20),
  `bank_ifsc` VARCHAR(11),
  `bank_branch` VARCHAR(255),
  `voucher_numbering` JSON,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `core_companyfullinfo_tenant_id` (`tenant_id`)
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

-- ─── RBAC Tables ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `rbac_users` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `username` VARCHAR(150) NOT NULL,
  `email` VARCHAR(255),
  `phone` VARCHAR(15),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `rbac_users_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rbac_user_role_assignments` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `role_id` BIGINT NOT NULL,
  `assigned_at` DATETIME(6) NOT NULL,
  `assigned_by_id` BIGINT,
  KEY `rbac_user_role_assignments_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rbac_permission_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `action` VARCHAR(255) NOT NULL,
  `resource` VARCHAR(255),
  `allowed` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL,
  `updated_at` DATETIME(6),
  KEY `rbac_permission_logs_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `roles` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `permissions` JSON,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `roles_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Dashboard ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `dashboard_layouts` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `user_id` BIGINT,
  `layout_data` JSON,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `dashboard_layouts_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Accounting / Master Tables ───────────────────────────────

CREATE TABLE IF NOT EXISTS `master_chart_of_accounts` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `type_of_business` VARCHAR(255) NOT NULL,
  `financial_reporting` VARCHAR(255) NOT NULL,
  `major_group` VARCHAR(255) NOT NULL,
  `group` VARCHAR(255) NOT NULL,
  `sub_group_1` VARCHAR(255),
  `sub_group_2` VARCHAR(255),
  `sub_group_3` VARCHAR(255),
  `ledger_name` VARCHAR(255),
  `ledger_code` VARCHAR(50) UNIQUE,
  `level_depth` INT NOT NULL DEFAULT 1,
  `import_version` VARCHAR(20) DEFAULT '1.0',
  `imported_at` DATETIME(6) NOT NULL,
  `is_leaf` TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `master_ledger_groups` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `parent` VARCHAR(255),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  UNIQUE KEY `master_ledger_groups_name_tenant` (`name`, `tenant_id`),
  KEY `master_ledger_groups_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `tenant_ledgers` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `master_ledger_id` BIGINT NOT NULL,
  `custom_alias` VARCHAR(255),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  UNIQUE KEY `tenant_ledgers_tenant_master` (`tenant_id`, `master_ledger_id`),
  CONSTRAINT `tenant_ledgers_master_ledger_id_fk` FOREIGN KEY (`master_ledger_id`) REFERENCES `master_chart_of_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `master_voucher_config` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL DEFAULT '__NUMBERING__',
  `sales_enable_auto` TINYINT(1) DEFAULT 1,
  `sales_prefix` VARCHAR(50),
  `sales_suffix` VARCHAR(50),
  `sales_next_number` BIGINT UNSIGNED DEFAULT 1,
  `sales_padding` INT DEFAULT 4,
  `sales_preview` VARCHAR(255),
  `purchase_enable_auto` TINYINT(1) DEFAULT 1,
  `purchase_prefix` VARCHAR(50),
  `purchase_suffix` VARCHAR(50),
  `purchase_next_number` BIGINT UNSIGNED DEFAULT 1,
  `purchase_padding` INT DEFAULT 4,
  `purchase_preview` VARCHAR(255),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `master_voucher_config_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `master_voucher_grn` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `grn_type` VARCHAR(100) DEFAULT 'other',
  `prefix` VARCHAR(50),
  `suffix` VARCHAR(50),
  `year` VARCHAR(4) DEFAULT '2024',
  `required_digits` INT DEFAULT 4,
  `preview` VARCHAR(255),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `master_voucher_grn_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `master_voucher_issue_slip` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `issue_slip_type` VARCHAR(100) DEFAULT 'other',
  `prefix` VARCHAR(50),
  `suffix` VARCHAR(50),
  `year` VARCHAR(4) DEFAULT '2024',
  `required_digits` INT DEFAULT 4,
  `preview` VARCHAR(255),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `master_voucher_issue_slip_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `voucher_configurations` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `voucher_type` VARCHAR(50) NOT NULL,
  `voucher_name` VARCHAR(255) NOT NULL,
  `enable_auto_numbering` TINYINT(1) DEFAULT 1,
  `prefix` VARCHAR(50),
  `suffix` VARCHAR(50),
  `start_from` BIGINT UNSIGNED DEFAULT 1,
  `current_number` BIGINT UNSIGNED DEFAULT 1,
  `required_digits` INT DEFAULT 4,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  UNIQUE KEY `voucher_configurations_tenant_type_name` (`tenant_id`, `voucher_type`, `voucher_name`),
  KEY `voucher_configurations_tenant_type` (`tenant_id`, `voucher_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `vouchers` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `voucher_number` VARCHAR(50) NOT NULL,
  `date` DATE NOT NULL,
  `party` VARCHAR(255),
  `account` VARCHAR(255),
  `amount` DECIMAL(15,2),
  `total` DECIMAL(15,2) DEFAULT 0,
  `narration` TEXT,
  `invoice_no` VARCHAR(50),
  `is_inter_state` TINYINT(1) DEFAULT 0,
  `total_taxable_amount` DECIMAL(15,2) DEFAULT 0,
  `total_cgst` DECIMAL(15,2) DEFAULT 0,
  `total_sgst` DECIMAL(15,2) DEFAULT 0,
  `total_igst` DECIMAL(15,2) DEFAULT 0,
  `total_debit` DECIMAL(15,2) DEFAULT 0,
  `total_credit` DECIMAL(15,2) DEFAULT 0,
  `from_account` VARCHAR(255),
  `to_account` VARCHAR(255),
  `items_data` JSON,
  `dummy_force` INT,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  UNIQUE KEY `vouchers_number_tenant_type` (`voucher_number`, `tenant_id`, `type`),
  KEY `vouchers_type_tenant_date` (`type`, `tenant_id`, `date`),
  KEY `vouchers_tenant_date` (`tenant_id`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `journal_entries` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `voucher_id` BIGINT NOT NULL,
  `ledger` VARCHAR(255) NOT NULL,
  `debit` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `credit` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `journal_entries_voucher_tenant` (`voucher_id`, `tenant_id`),
  CONSTRAINT `journal_entries_voucher_id_fk` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sales_vouchers` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `voucher_number` VARCHAR(50),
  `invoice_date` DATE,
  `customer_name` VARCHAR(255),
  `bill_to` TEXT,
  `ship_to` TEXT,
  `gstin` VARCHAR(15),
  `state_type` VARCHAR(20) DEFAULT 'within',
  `tax_type` VARCHAR(50),
  `total_taxable_value` DECIMAL(15,2) DEFAULT 0,
  `total_igst` DECIMAL(15,2) DEFAULT 0,
  `total_cgst` DECIMAL(15,2) DEFAULT 0,
  `total_sgst` DECIMAL(15,2) DEFAULT 0,
  `total_cess` DECIMAL(15,2) DEFAULT 0,
  `total_invoice_value` DECIMAL(15,2) DEFAULT 0,
  `status` VARCHAR(20) DEFAULT 'draft',
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `sales_vouchers_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sales_voucher_items` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `sales_voucher_id` BIGINT NOT NULL,
  `item_name` VARCHAR(255),
  `hsn_sac` VARCHAR(50),
  `qty` DECIMAL(18,4) DEFAULT 0,
  `uom` VARCHAR(50),
  `rate` DECIMAL(18,2) DEFAULT 0,
  `taxable_value` DECIMAL(18,2) DEFAULT 0,
  `igst` DECIMAL(18,2) DEFAULT 0,
  `cgst` DECIMAL(18,2) DEFAULT 0,
  `sgst` DECIMAL(18,2) DEFAULT 0,
  `invoice_value` DECIMAL(18,2) DEFAULT 0,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `sales_voucher_items_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sales_voucher_documents` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `sales_voucher_id` BIGINT NOT NULL,
  `document_path` VARCHAR(500),
  `document_type` VARCHAR(100),
  `uploaded_at` DATETIME(6),
  KEY `sales_voucher_documents_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sales_invoices` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `invoice_number` VARCHAR(50) NOT NULL,
  `invoice_date` DATE NOT NULL,
  `voucher_type_id` BIGINT,
  `customer_id` BIGINT,
  `bill_to_address` TEXT NOT NULL,
  `bill_to_gstin` VARCHAR(15),
  `bill_to_contact` VARCHAR(255),
  `bill_to_state` VARCHAR(100),
  `bill_to_country` VARCHAR(100) DEFAULT 'India',
  `ship_to_address` TEXT NOT NULL,
  `ship_to_state` VARCHAR(100),
  `ship_to_country` VARCHAR(100) DEFAULT 'India',
  `tax_type` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) DEFAULT 'draft',
  `current_step` INT DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  UNIQUE KEY `sales_invoices_tenant_invoice_no` (`tenant_id`, `invoice_number`),
  KEY `sales_invoices_tenant_date` (`tenant_id`, `invoice_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sales_items` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `sales_invoice_id` BIGINT,
  `item_name` VARCHAR(255),
  `hsn_sac` VARCHAR(50),
  `quantity` DECIMAL(15,4) DEFAULT 0,
  `uom` VARCHAR(50),
  `rate` DECIMAL(15,2) DEFAULT 0,
  `taxable_value` DECIMAL(15,2) DEFAULT 0,
  `gst_rate` DECIMAL(5,2) DEFAULT 0,
  `igst_amount` DECIMAL(15,2) DEFAULT 0,
  `cgst_amount` DECIMAL(15,2) DEFAULT 0,
  `sgst_amount` DECIMAL(15,2) DEFAULT 0,
  `item_amount` DECIMAL(15,2) DEFAULT 0,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `sales_items_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sales_master` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `invoice_no` VARCHAR(50),
  `invoice_date` DATE,
  `customer_name` VARCHAR(255),
  `gstin` VARCHAR(15),
  `total_amount` DECIMAL(15,2) DEFAULT 0,
  `status` VARCHAR(50) DEFAULT 'draft',
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `sales_master_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sales_payment` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `sales_id` BIGINT,
  `payment_date` DATE,
  `amount` DECIMAL(15,2) DEFAULT 0,
  `payment_mode` VARCHAR(50),
  `reference_no` VARCHAR(100),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `sales_payment_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sales_returns` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `original_invoice_id` BIGINT,
  `return_date` DATE,
  `return_reason` TEXT,
  `total_amount` DECIMAL(15,2) DEFAULT 0,
  `status` VARCHAR(50) DEFAULT 'draft',
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `sales_returns_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sales_return_items` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `sales_return_id` BIGINT NOT NULL,
  `item_name` VARCHAR(255),
  `quantity` DECIMAL(15,4) DEFAULT 0,
  `rate` DECIMAL(15,2) DEFAULT 0,
  `amount` DECIMAL(15,2) DEFAULT 0,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `sales_return_items_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Purchase Tables ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `purchase_master` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `invoice_no` VARCHAR(50),
  `invoice_date` DATE,
  `vendor_name` VARCHAR(255),
  `gstin` VARCHAR(15),
  `total_taxable_value` DECIMAL(15,2) DEFAULT 0,
  `total_igst` DECIMAL(15,2) DEFAULT 0,
  `total_cgst` DECIMAL(15,2) DEFAULT 0,
  `total_sgst` DECIMAL(15,2) DEFAULT 0,
  `total_invoice_value` DECIMAL(15,2) DEFAULT 0,
  `status` VARCHAR(50) DEFAULT 'draft',
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `purchase_master_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `purchase_items` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `purchase_id` BIGINT,
  `item_name` VARCHAR(255),
  `hsn_sac` VARCHAR(50),
  `quantity` DECIMAL(15,4) DEFAULT 0,
  `uom` VARCHAR(50),
  `rate` DECIMAL(15,2) DEFAULT 0,
  `taxable_value` DECIMAL(15,2) DEFAULT 0,
  `gst_rate` DECIMAL(5,2) DEFAULT 0,
  `igst_amount` DECIMAL(15,2) DEFAULT 0,
  `cgst_amount` DECIMAL(15,2) DEFAULT 0,
  `sgst_amount` DECIMAL(15,2) DEFAULT 0,
  `item_amount` DECIMAL(15,2) DEFAULT 0,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `purchase_items_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `purchase_payment` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `purchase_id` BIGINT,
  `payment_date` DATE,
  `amount` DECIMAL(15,2) DEFAULT 0,
  `payment_mode` VARCHAR(50),
  `reference_no` VARCHAR(100),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `purchase_payment_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `purchase_returns` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `original_purchase_id` BIGINT,
  `return_date` DATE,
  `return_reason` TEXT,
  `total_amount` DECIMAL(15,2) DEFAULT 0,
  `status` VARCHAR(50) DEFAULT 'draft',
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `purchase_returns_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `purchase_return_items` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `purchase_return_id` BIGINT NOT NULL,
  `item_name` VARCHAR(255),
  `quantity` DECIMAL(15,4) DEFAULT 0,
  `rate` DECIMAL(15,2) DEFAULT 0,
  `amount` DECIMAL(15,2) DEFAULT 0,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `purchase_return_items_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Receipt / Payment Voucher Tables ─────────────────────────

CREATE TABLE IF NOT EXISTS `receipt_voucher_types` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `description` TEXT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `display_order` INT DEFAULT 0,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  UNIQUE KEY `receipt_voucher_types_tenant_code` (`tenant_id`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `receipt_voucher_master` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `voucher_no` VARCHAR(50),
  `voucher_date` DATE,
  `account` VARCHAR(255),
  `party` VARCHAR(255),
  `amount` DECIMAL(15,2) DEFAULT 0,
  `narration` TEXT,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `receipt_voucher_master_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `receipt_voucher_entries` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `receipt_voucher_id` BIGINT NOT NULL,
  `ledger` VARCHAR(255),
  `amount` DECIMAL(15,2) DEFAULT 0,
  `dr_cr` VARCHAR(2),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `receipt_voucher_entries_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payment_voucher_master` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `voucher_no` VARCHAR(50),
  `voucher_date` DATE,
  `account` VARCHAR(255),
  `party` VARCHAR(255),
  `amount` DECIMAL(15,2) DEFAULT 0,
  `narration` TEXT,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `payment_voucher_master_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payment_voucher_entries` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `payment_voucher_id` BIGINT NOT NULL,
  `ledger` VARCHAR(255),
  `amount` DECIMAL(15,2) DEFAULT 0,
  `dr_cr` VARCHAR(2),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `payment_voucher_entries_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Inventory Additional Tables ──────────────────────────────

CREATE TABLE IF NOT EXISTS `inventory_categories` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `parent_id` BIGINT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `inventory_categories_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `inventory_inventorylocation` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `location_type` VARCHAR(50) DEFAULT 'warehouse',
  `address` TEXT,
  `city` VARCHAR(100),
  `state` VARCHAR(100),
  `pincode` VARCHAR(20),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `inventory_inventorylocation_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `inventory_unit` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL DEFAULT 'Number',
  `symbol` VARCHAR(50) NOT NULL DEFAULT 'nos',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `inventory_unit_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `inventory_operation_deliverychallan` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `challan_no` VARCHAR(100),
  `date` DATE,
  `time` TIME,
  `from_location` VARCHAR(255),
  `to_location` VARCHAR(255),
  `vendor_id` BIGINT,
  `vendor_name` VARCHAR(255),
  `customer_name` VARCHAR(255),
  `items` JSON,
  `eway_bill_details` JSON,
  `delivery_challan` JSON,
  `posting_note` TEXT,
  `status` VARCHAR(50) DEFAULT 'Draft',
  `mode_of_transport` VARCHAR(100),
  `dispatch_date` DATE,
  `vehicle_no` VARCHAR(100),
  `transporter_name` VARCHAR(255),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `inventory_operation_deliverychallan_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `inventory_operation_ewaybill` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `ewb_no` VARCHAR(50),
  `ewb_date` DATE,
  `operation_type` VARCHAR(50),
  `operation_id` BIGINT,
  `from_place` VARCHAR(255),
  `to_place` VARCHAR(255),
  `mode_of_transport` VARCHAR(100),
  `vehicle_no` VARCHAR(100),
  `distance` VARCHAR(50),
  `validity` VARCHAR(50),
  `status` VARCHAR(50) DEFAULT 'Active',
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `inventory_operation_ewaybill_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `item_id` BIGINT,
  `item_name` VARCHAR(255),
  `movement_type` VARCHAR(50),
  `quantity` DECIMAL(15,4) DEFAULT 0,
  `uom` VARCHAR(50),
  `from_location_id` BIGINT,
  `to_location_id` BIGINT,
  `reference_type` VARCHAR(100),
  `reference_id` BIGINT,
  `movement_date` DATE,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `stock_movements_tenant_id` (`tenant_id`),
  KEY `stock_movements_item_date` (`item_id`, `movement_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `warehouses` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50),
  `address` TEXT,
  `city` VARCHAR(100),
  `state` VARCHAR(100),
  `pincode` VARCHAR(20),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `warehouses_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `items` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `item_code` VARCHAR(100),
  `item_name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `category` VARCHAR(255),
  `uom` VARCHAR(50) DEFAULT 'nos',
  `rate` DECIMAL(15,2) DEFAULT 0,
  `hsn_code` VARCHAR(20),
  `gst_rate` DECIMAL(5,2),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `items_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Customer Tables ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `customers` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `customer_code` VARCHAR(50),
  `customer_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255),
  `phone` VARCHAR(20),
  `gstin` VARCHAR(15),
  `billing_address` TEXT,
  `shipping_address` TEXT,
  `state` VARCHAR(100),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `customers_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `customer_master` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `customer_code` VARCHAR(50),
  `customer_name` VARCHAR(255) NOT NULL,
  `pan_no` VARCHAR(10),
  `contact_person` VARCHAR(100),
  `email` VARCHAR(255),
  `contact_no` VARCHAR(20),
  `customer_category` VARCHAR(200),
  `billing_currency` VARCHAR(10),
  `is_also_vendor` TINYINT(1) DEFAULT 0,
  `tds_applicable` TINYINT(1) DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `customer_master_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `customer_master_customer_basicdetail` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_code` VARCHAR(50),
  `email` VARCHAR(255),
  `phone` VARCHAR(20),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `customer_master_customer_basicdetail_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `customer_addresses` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `customer_id` BIGINT NOT NULL,
  `address_type` VARCHAR(50) DEFAULT 'billing',
  `address_line1` VARCHAR(255),
  `address_line2` VARCHAR(255),
  `city` VARCHAR(100),
  `state` VARCHAR(100),
  `pincode` VARCHAR(20),
  `country` VARCHAR(100) DEFAULT 'India',
  `is_default` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `customer_addresses_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `customer_transaction` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `customer_id` BIGINT,
  `transaction_type` VARCHAR(50),
  `transaction_date` DATE,
  `amount` DECIMAL(15,2) DEFAULT 0,
  `reference_no` VARCHAR(100),
  `notes` TEXT,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `customer_transaction_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `customer_sales_quotation` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `quotation_no` VARCHAR(50),
  `quotation_date` DATE,
  `customer_id` BIGINT,
  `customer_name` VARCHAR(255),
  `total_amount` DECIMAL(15,2) DEFAULT 0,
  `status` VARCHAR(50) DEFAULT 'draft',
  `valid_till` DATE,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `customer_sales_quotation_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `customer_masters_salesorder` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `order_no` VARCHAR(50),
  `order_type` VARCHAR(50),
  `prefix` VARCHAR(50),
  `suffix` VARCHAR(50),
  `digits` INT DEFAULT 4,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `customer_masters_salesorder_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `customer_sales_order` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `order_no` VARCHAR(50),
  `order_date` DATE,
  `customer_id` BIGINT,
  `customer_name` VARCHAR(255),
  `total_amount` DECIMAL(15,2) DEFAULT 0,
  `status` VARCHAR(50) DEFAULT 'draft',
  `delivery_date` DATE,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `customer_sales_order_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Portal Users ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `customer_portal_users` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `customer_id` BIGINT,
  `username` VARCHAR(150) NOT NULL,
  `email` VARCHAR(255),
  `password_hash` VARCHAR(255),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login` DATETIME(6),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `customer_portal_users_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `vendor_portal_users` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `vendor_id` BIGINT,
  `username` VARCHAR(150) NOT NULL,
  `email` VARCHAR(255),
  `password_hash` VARCHAR(255),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login` DATETIME(6),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `vendor_portal_users_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Vendor Master Tables ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS `vendor_master` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `vendor_code` VARCHAR(50) UNIQUE,
  `vendor_name` VARCHAR(200) NOT NULL,
  `display_name` VARCHAR(200),
  `vendor_type` VARCHAR(50) DEFAULT 'supplier',
  `contact_person` VARCHAR(100),
  `email` VARCHAR(255),
  `phone` VARCHAR(20),
  `mobile` VARCHAR(20),
  `website` VARCHAR(255),
  `billing_address_line1` VARCHAR(255),
  `billing_address_line2` VARCHAR(255),
  `billing_city` VARCHAR(100),
  `billing_state` VARCHAR(100),
  `billing_country` VARCHAR(100) DEFAULT 'India',
  `billing_pincode` VARCHAR(10),
  `gstin` VARCHAR(15),
  `pan` VARCHAR(10),
  `payment_terms` VARCHAR(50) DEFAULT 'net_30',
  `credit_limit` DECIMAL(15,2),
  `bank_name` VARCHAR(255),
  `bank_account_number` VARCHAR(20),
  `bank_ifsc` VARCHAR(11),
  `notes` TEXT,
  `opening_balance` DECIMAL(15,2) DEFAULT 0,
  `current_balance` DECIMAL(15,2) DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `is_verified` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `vendor_master_tenant_id` (`tenant_id`),
  KEY `vendor_master_tenant_name` (`tenant_id`, `vendor_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `vendors` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `vendor_name` VARCHAR(255) NOT NULL,
  `gstin` VARCHAR(15),
  `email` VARCHAR(255),
  `phone` VARCHAR(20),
  `address` TEXT,
  `city` VARCHAR(100),
  `state` VARCHAR(100),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `vendors_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `vendors_po_series` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `prefix` VARCHAR(50),
  `suffix` VARCHAR(50),
  `digits` INT DEFAULT 4,
  `current_number` INT DEFAULT 1,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `vendors_po_series_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── GST Tables ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `gst_gstcredentials` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `gstin` VARCHAR(15) NOT NULL,
  `username` VARCHAR(255),
  `password_encrypted` VARCHAR(500),
  `client_id` VARCHAR(255),
  `client_secret` VARCHAR(500),
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `gst_gstcredentials_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `gst_gsttoken` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `gstin` VARCHAR(15) NOT NULL,
  `access_token` TEXT,
  `token_type` VARCHAR(50),
  `expires_in` INT,
  `expires_at` DATETIME(6),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `gst_gsttoken_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `gst_gstreturn` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `gstin` VARCHAR(15) NOT NULL,
  `return_type` VARCHAR(20) NOT NULL,
  `tax_period` VARCHAR(10) NOT NULL,
  `status` VARCHAR(50),
  `filed_date` DATETIME(6),
  `due_date` DATE,
  `data` JSON,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `gst_gstreturn_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `gst_gstr2breconciliation` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `gstin` VARCHAR(15) NOT NULL,
  `tax_period` VARCHAR(10) NOT NULL,
  `supplier_gstin` VARCHAR(15),
  `invoice_no` VARCHAR(50),
  `invoice_date` DATE,
  `taxable_value` DECIMAL(15,2),
  `igst` DECIMAL(15,2),
  `cgst` DECIMAL(15,2),
  `sgst` DECIMAL(15,2),
  `match_status` VARCHAR(50),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `gst_gstr2breconciliation_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

-- ─── Payroll Additional Tables ────────────────────────────────

CREATE TABLE IF NOT EXISTS `payroll_employee` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `employee_code` VARCHAR(50) UNIQUE NOT NULL,
  `employee_name` VARCHAR(200) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `phone` VARCHAR(20),
  `date_of_birth` DATE,
  `gender` VARCHAR(10),
  `address` TEXT,
  `department` VARCHAR(100),
  `designation` VARCHAR(100),
  `date_of_joining` DATE,
  `employment_type` VARCHAR(20) DEFAULT 'Full-Time',
  `basic_salary` DECIMAL(12,2) DEFAULT 0,
  `hra` DECIMAL(12,2) DEFAULT 0,
  `pan_number` VARCHAR(10),
  `uan_number` VARCHAR(12),
  `esi_number` VARCHAR(17),
  `aadhar_number` VARCHAR(12),
  `account_number` VARCHAR(20),
  `ifsc_code` VARCHAR(11),
  `bank_name` VARCHAR(100),
  `branch_name` VARCHAR(100),
  `status` VARCHAR(10) DEFAULT 'Active',
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `payroll_employee_tenant_status` (`tenant_id`, `status`),
  KEY `payroll_employee_code` (`employee_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payroll_salary_component` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `component_code` VARCHAR(50) NOT NULL,
  `component_name` VARCHAR(100) NOT NULL,
  `component_type` VARCHAR(10) NOT NULL,
  `calculation_type` VARCHAR(20) DEFAULT 'Fixed',
  `default_value` DECIMAL(12,2) DEFAULT 0,
  `is_statutory` TINYINT(1) DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  UNIQUE KEY `payroll_salary_component_tenant_code` (`tenant_id`, `component_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payroll_salary_template_component` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `template_id` BIGINT NOT NULL,
  `component_id` BIGINT NOT NULL,
  `value` DECIMAL(12,2) DEFAULT 0,
  UNIQUE KEY `payroll_salary_template_component_uniq` (`template_id`, `component_id`),
  CONSTRAINT `payroll_salary_template_component_template_fk` FOREIGN KEY (`template_id`) REFERENCES `payroll_salary_template` (`id`),
  CONSTRAINT `payroll_salary_template_component_component_fk` FOREIGN KEY (`component_id`) REFERENCES `payroll_salary_component` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payroll_employee_salary_structure` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `employee_id` BIGINT NOT NULL,
  `template_id` BIGINT,
  `effective_from` DATE,
  `components` JSON,
  `gross_salary` DECIMAL(12,2) DEFAULT 0,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `payroll_employee_salary_structure_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payroll_pay_run_detail` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `pay_run_id` BIGINT NOT NULL,
  `employee_id` BIGINT NOT NULL,
  `basic_salary` DECIMAL(12,2) DEFAULT 0,
  `hra` DECIMAL(12,2) DEFAULT 0,
  `other_allowances` DECIMAL(12,2) DEFAULT 0,
  `gross_salary` DECIMAL(12,2) DEFAULT 0,
  `epf_employee` DECIMAL(12,2) DEFAULT 0,
  `esi_employee` DECIMAL(12,2) DEFAULT 0,
  `professional_tax` DECIMAL(12,2) DEFAULT 0,
  `tds` DECIMAL(12,2) DEFAULT 0,
  `other_deductions` DECIMAL(12,2) DEFAULT 0,
  `total_deductions` DECIMAL(12,2) DEFAULT 0,
  `net_salary` DECIMAL(12,2) DEFAULT 0,
  `days_present` INT DEFAULT 0,
  `days_absent` INT DEFAULT 0,
  `paid_leaves` INT DEFAULT 0,
  `is_paid` TINYINT(1) DEFAULT 0,
  `payment_date` DATE,
  `payment_reference` VARCHAR(100),
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  UNIQUE KEY `payroll_pay_run_detail_run_emp` (`pay_run_id`, `employee_id`),
  CONSTRAINT `payroll_pay_run_detail_run_fk` FOREIGN KEY (`pay_run_id`) REFERENCES `payroll_pay_run` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payroll_statutory_configuration` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `statutory_type` VARCHAR(10) NOT NULL,
  `employee_contribution_percentage` DECIMAL(5,2) DEFAULT 0,
  `employer_contribution_percentage` DECIMAL(5,2) DEFAULT 0,
  `salary_threshold` DECIMAL(12,2),
  `state` VARCHAR(50),
  `pt_slab_data` JSON,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  UNIQUE KEY `payroll_statutory_configuration_tenant_type` (`tenant_id`, `statutory_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payroll_attendance` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `employee_id` BIGINT NOT NULL,
  `attendance_date` DATE NOT NULL,
  `status` VARCHAR(20) DEFAULT 'Present',
  `check_in_time` TIME,
  `check_out_time` TIME,
  `working_hours` DECIMAL(5,2) DEFAULT 0,
  `overtime_hours` DECIMAL(5,2) DEFAULT 0,
  `remarks` TEXT,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  UNIQUE KEY `payroll_attendance_emp_date` (`employee_id`, `attendance_date`),
  KEY `payroll_attendance_tenant_date` (`tenant_id`, `attendance_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payroll_leave_application` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `employee_id` BIGINT NOT NULL,
  `leave_type` VARCHAR(20) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `total_days` INT DEFAULT 1,
  `reason` TEXT NOT NULL,
  `status` VARCHAR(20) DEFAULT 'Pending',
  `approved_by` VARCHAR(100),
  `approved_date` DATETIME(6),
  `rejection_reason` TEXT,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `payroll_leave_application_tenant_status` (`tenant_id`, `status`),
  KEY `payroll_leave_application_emp_start` (`employee_id`, `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Services Tables ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `service_groups` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6),
  `updated_at` DATETIME(6),
  KEY `service_groups_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── End of missing_tables.sql ────────────────────────────────
