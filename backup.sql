
 create database Finpixe_AI_Accounting;
 use Finpixe_AI_Accounting;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `ai_usage`;
CREATE TABLE `ai_usage` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `year` int NOT NULL,
  `month` int NOT NULL,
  `used_count` int DEFAULT '0',
  `plan` varchar(50) DEFAULT 'FREE',
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_year_month` (`tenant_id`,`year`,`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;  
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `amount_transactions`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `amount_transactions`;
CREATE TABLE `amount_transactions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `transaction_date` date NOT NULL,
  `transaction_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'transaction',
  `debit` decimal(15,2) NOT NULL DEFAULT '0.00',
  `credit` decimal(15,2) NOT NULL DEFAULT '0.00',
  `balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `narration` longtext COLLATE utf8mb4_unicode_ci,
  `ledger_id` bigint NOT NULL,
  `ledger_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Ledger name (e.g., bank2, Cash, HDFC Bank)',
  `sub_group_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `tenant_id` (`tenant_id`),
  KEY `amount_tran_tenant__d7c201_idx` (`tenant_id`,`ledger_id`,`transaction_date`),
  KEY `amount_tran_tenant__9534d3_idx` (`tenant_id`,`transaction_type`),
  KEY `amount_tran_transac_10f4ee_idx` (`transaction_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `answers`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `answers`;
CREATE TABLE `answers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ledger_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `answer` longtext COLLATE utf8mb4_unicode_ci,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sub_group_1_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sub_group_1_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `question` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tenants`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `tenants`;
CREATE TABLE `tenants` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bank_statement_transactions`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `bank_statement_transactions`;
CREATE TABLE `bank_statement_transactions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bank_ledger_id` bigint NOT NULL COMMENT 'FK to master_ledgers (Bank/Cash ledger)',
  `transaction_date` date NOT NULL COMMENT 'Date of bank transaction',
  `narration` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Transaction description/narration',
  `debit` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Debit amount (money out)',
  `credit` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Credit amount (money in)',
  `reference_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Cheque No / UTR / Transaction ID',
  `match_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Unmatched' COMMENT 'Matched | Possible Match | Unmatched | Ignored',
  `matched_voucher_id` bigint DEFAULT NULL COMMENT 'FK to vouchers.id when matched',
  `confidence_score` int DEFAULT '0',
  `multi_voucher_ids` json DEFAULT NULL,
  `suggested_party` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `suggested_invoice` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `suggested_voucher_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_ignored` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'User explicitly ignored this transaction',
  `reconciled_at` datetime(6) DEFAULT NULL COMMENT 'Timestamp when reconciled',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `cheque_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `running_balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `import_batch_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'BANK_UPLOAD',
  `match_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_bank_stmt_txn` (`bank_ledger_id`,`transaction_date`,`reference_number`,`debit`,`credit`),
  KEY `idx_bank_st_tenant_ledger_status` (`tenant_id`,`bank_ledger_id`,`match_status`),
  KEY `idx_bank_st_tenant_date` (`tenant_id`,`transaction_date`),
  KEY `idx_bank_st_tenant` (`tenant_id`),
  CONSTRAINT `fk_bank_st_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Staging table for bank statement transactions. Populated on upload; vouchers NOT created here.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bank_reconciliation_links`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `bank_reconciliation_links`;
CREATE TABLE `bank_reconciliation_links` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bank_transaction_id` bigint NOT NULL COMMENT 'FK to bank_statement_transactions',
  `voucher_id` bigint NOT NULL COMMENT 'FK to vouchers.id',
  `reconciliation_date` date DEFAULT NULL COMMENT 'Date when reconciled',
  `reconciliation_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Reconciled' COMMENT 'Reconciled | Pending | Disputed',
  `reconciliation_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual' COMMENT 'automatic | manual',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `voucher_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidence_score` int DEFAULT '0',
  `match_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cheque_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reconciled_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bank_transaction_voucher` (`bank_transaction_id`,`voucher_id`),
  KEY `idx_bank_rec_tenant` (`tenant_id`),
  KEY `idx_bank_rec_voucher` (`voucher_id`),
  CONSTRAINT `fk_bank_rec_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bank_rec_transaction` FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_statement_transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores bank transaction → voucher reconciliation mappings. Separate from voucher tables.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bulk_invoice_jobs`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `bulk_invoice_jobs`;
CREATE TABLE `bulk_invoice_jobs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_files` int NOT NULL DEFAULT '0',
  `processed_count` int NOT NULL DEFAULT '0',
  `failed_count` int NOT NULL DEFAULT '0',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `segmentation_done` tinyint(1) DEFAULT '0',
  `file_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timeout_rate` float DEFAULT '0',
  `success_rate` float DEFAULT '0',
  `upload_session_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bulk_invoice_jobs_tenant_id_idx` (`tenant_id`),
  KEY `bulk_invoice_jobs_status_idx` (`status`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `company_informations`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `company_informations`;
CREATE TABLE `company_informations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address_line1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pincode` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'India',
  `phone` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mobile` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gstin` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pan` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cin` varchar(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tan` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `business_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `industry_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `financial_year_start` date DEFAULT NULL,
  `financial_year_end` date DEFAULT NULL,
  `logo_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `signature_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_ifsc` varchar(11) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_branch` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voucher_numbering` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_informations_tenant_unique` (`tenant_id`),
  CONSTRAINT `company_informations_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master`;
CREATE TABLE `customer_master` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `customer_code` varchar(50) NOT NULL,
  `customer_name` varchar(255) NOT NULL,
  `email` varchar(254) DEFAULT NULL,
  `phone` varchar(15) DEFAULT NULL,
  `mobile` varchar(15) DEFAULT NULL,
  `address_line1` varchar(255) DEFAULT NULL,
  `address_line2` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `country` varchar(100) DEFAULT 'India',
  `pincode` varchar(10) DEFAULT NULL,
  `gstin` varchar(15) DEFAULT NULL,
  `pan` varchar(10) DEFAULT NULL,
  `category_id` int DEFAULT NULL,
  `credit_limit` decimal(15,2) NOT NULL DEFAULT '0.00',
  `credit_days` int NOT NULL DEFAULT '0',
  `opening_balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `current_balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_master_customer_code_unique` (`customer_code`),
  KEY `customer_master_tenant_code_idx` (`tenant_id`,`customer_code`),
  KEY `customer_master_tenant_deleted_idx` (`tenant_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master_category`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master_category`;
CREATE TABLE `customer_master_category` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Top-level category',
  `group` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `subgroup` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this category is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_category_tenant_unique` (`tenant_id`,`category`(100),`group`(100),`subgroup`(100)),
  KEY `customer_category_tenant_id_idx` (`tenant_id`),
  KEY `customer_category_is_active_idx` (`tenant_id`,`is_active`),
  KEY `customer_category_category_idx` (`category`(100))
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Master Category Hierarchy';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_ledgers`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_ledgers`;
CREATE TABLE `master_ledgers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Custom ledger name',
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'From hierarchy: major_group_1',
  `group` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sub_group_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'From hierarchy: sub_group_1_1',
  `sub_group_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'From hierarchy: sub_group_2_1',
  `sub_group_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'From hierarchy: sub_group_3_1',
  `ledger_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'From hierarchy: ledger_1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `gstin` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registration_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extended_data` json DEFAULT NULL,
  `parent_ledger_id` int DEFAULT NULL,
  `ledger_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type_of_business` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `financial_reporting` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `major_group` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ledger` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `additional_data` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `master_ledgers_name_tenant_unique` (`name`,`tenant_id`),
  UNIQUE KEY `master_ledgers_ledger_code_tenant_id_ef0135d0_uniq` (`ledger_code`,`tenant_id`),
  KEY `master_ledgers_tenant_id_idx` (`tenant_id`),
  KEY `master_ledgers_category_idx` (`category`),
  KEY `master_ledgers_group_idx` (`group`),
  CONSTRAINT `master_ledgers_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master_customer_basicdetails`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master_customer_basicdetails`;
CREATE TABLE `customer_master_customer_basicdetails` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_category_id` bigint DEFAULT NULL,
  `pan_number` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_person` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_address` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_number` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_also_vendor` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gst_tds_applicable` tinyint(1) DEFAULT '0',
  `billing_currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ledger_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_basic_tenant_code_uniq` (`tenant_id`,`customer_code`),
  UNIQUE KEY `customer_basic_tenant_id_uniq` (`tenant_id`,`id`),
  KEY `customer_basic_tenant_id_idx` (`tenant_id`),
  KEY `customer_basic_category_idx` (`customer_category_id`),
  KEY `fk_customer_ledger` (`ledger_id`),
  CONSTRAINT `customer_basic_category_fk` FOREIGN KEY (`customer_category_id`) REFERENCES `customer_master_category` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_customer_ledger` FOREIGN KEY (`ledger_id`) REFERENCES `master_ledgers` (`id`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master_customer_banking`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master_customer_banking`;
CREATE TABLE `customer_master_customer_banking` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_basic_detail_id` bigint NOT NULL,
  `account_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ifsc_code` varchar(11) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `swift_code` varchar(11) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `associated_branches` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `customer_bank_tenant_acc_idx` (`tenant_id`,`account_number`),
  KEY `customer_bank_basic_detail_idx` (`customer_basic_detail_id`),
  CONSTRAINT `customer_bank_basic_detail_fk` FOREIGN KEY (`customer_basic_detail_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master_customer_gstdetails`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master_customer_gstdetails`;
CREATE TABLE `customer_master_customer_gstdetails` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_basic_detail_id` bigint NOT NULL,
  `gstin` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_unregistered` tinyint(1) NOT NULL DEFAULT '0',
  `branch_reference_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_address` longtext COLLATE utf8mb4_unicode_ci,
  `branch_contact_person` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_contact_number` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pincode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `customer_gst_tenant_gstin_idx` (`tenant_id`,`gstin`),
  KEY `customer_gst_basic_detail_idx` (`customer_basic_detail_id`),
  CONSTRAINT `customer_gst_basic_detail_fk` FOREIGN KEY (`customer_basic_detail_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master_customer_productservice`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master_customer_productservice`;
CREATE TABLE `customer_master_customer_productservice` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_basic_detail_id` bigint DEFAULT NULL,
  `item_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Our Item Code',
  `item_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Our Item Name',
  `uom` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Unit of Measure',
  `customer_item_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Customer Item Code',
  `customer_item_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Customer Item Name',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `packing_notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `customer_prod_tenant_item_idx` (`tenant_id`,`item_code`),
  KEY `customer_prod_basic_detail_idx` (`customer_basic_detail_id`),
  CONSTRAINT `customer_prod_basic_detail_fk` FOREIGN KEY (`customer_basic_detail_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master_customer_tds`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master_customer_tds`;
CREATE TABLE `customer_master_customer_tds` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_basic_detail_id` bigint NOT NULL,
  `msme_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fssai_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iec_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eou_status` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tcs_section` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tcs_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `tds_section` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tds_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_tds_basic_detail_uniq` (`customer_basic_detail_id`),
  KEY `customer_tds_tenant_idx` (`tenant_id`),
  CONSTRAINT `customer_tds_basic_detail_fk` FOREIGN KEY (`customer_basic_detail_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master_customer_termscondition`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master_customer_termscondition`;
CREATE TABLE `customer_master_customer_termscondition` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_basic_detail_id` bigint DEFAULT NULL,
  `credit_period` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `credit_terms` longtext COLLATE utf8mb4_unicode_ci,
  `penalty_terms` longtext COLLATE utf8mb4_unicode_ci,
  `delivery_terms` longtext COLLATE utf8mb4_unicode_ci,
  `warranty_details` longtext COLLATE utf8mb4_unicode_ci,
  `force_majeure` longtext COLLATE utf8mb4_unicode_ci,
  `dispute_terms` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_terms_basic_detail_uniq` (`customer_basic_detail_id`),
  KEY `customer_terms_tenant_idx` (`tenant_id`),
  CONSTRAINT `customer_terms_basic_detail_fk` FOREIGN KEY (`customer_basic_detail_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master_longtermcontracts_basicdetails`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master_longtermcontracts_basicdetails`;
CREATE TABLE `customer_master_longtermcontracts_basicdetails` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `contract_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int NOT NULL COMMENT 'Reference to customer',
  `customer_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Customer name for display',
  `branch_id` int DEFAULT NULL COMMENT 'Reference to branch',
  `contract_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contract_validity_from` date NOT NULL,
  `contract_validity_to` date NOT NULL,
  `contract_document` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'File path to uploaded contract document',
  `automate_billing` tinyint(1) NOT NULL DEFAULT '0',
  `bill_start_date` date DEFAULT NULL,
  `billing_frequency` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voucher_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bill_period_from` date DEFAULT NULL,
  `bill_period_to` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_ltc_basic_tenant_contract_unique` (`tenant_id`,`contract_number`),
  KEY `cust_ltc_basic_tenant_id_idx` (`tenant_id`),
  KEY `cust_ltc_basic_customer_id_idx` (`tenant_id`,`customer_id`),
  KEY `cust_ltc_basic_validity_idx` (`contract_validity_from`,`contract_validity_to`),
  KEY `cust_ltc_basic_is_deleted_idx` (`tenant_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Master Long-term Contract Basic Details';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master_longtermcontracts_productservices`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master_longtermcontracts_productservices`;
CREATE TABLE `customer_master_longtermcontracts_productservices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `contract_basic_detail_id` int NOT NULL COMMENT 'Foreign key to customer_master_longtermcontracts_basicdetails',
  `item_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Our item code',
  `item_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Our item name',
  `customer_item_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Customer''s item name',
  `qty_min` decimal(15,2) DEFAULT NULL COMMENT 'Minimum quantity',
  `qty_max` decimal(15,2) DEFAULT NULL COMMENT 'Maximum quantity',
  `price_min` decimal(15,2) DEFAULT NULL COMMENT 'Minimum price',
  `price_max` decimal(15,2) DEFAULT NULL COMMENT 'Maximum price',
  `acceptable_price_deviation` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g., ┬▒5%',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `cust_ltc_prod_tenant_item_idx` (`tenant_id`,`item_code`),
  KEY `cust_ltc_prod_contract_idx` (`contract_basic_detail_id`),
  CONSTRAINT `cust_ltc_prod_contract_fk` FOREIGN KEY (`contract_basic_detail_id`) REFERENCES `customer_master_longtermcontracts_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Master Long-term Contract Products/Services';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_master_longtermcontracts_termscondition`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_master_longtermcontracts_termscondition`;
CREATE TABLE `customer_master_longtermcontracts_termscondition` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `contract_basic_detail_id` int NOT NULL COMMENT 'Foreign key to customer_master_longtermcontracts_basicdetails',
  `payment_terms` longtext COLLATE utf8mb4_unicode_ci,
  `penalty_terms` longtext COLLATE utf8mb4_unicode_ci,
  `force_majeure` longtext COLLATE utf8mb4_unicode_ci,
  `termination_clause` longtext COLLATE utf8mb4_unicode_ci,
  `dispute_terms` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Dispute & Redressal Terms',
  `others` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Other terms',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_ltc_terms_contract_unique` (`contract_basic_detail_id`),
  KEY `cust_ltc_terms_tenant_idx` (`tenant_id`),
  CONSTRAINT `cust_ltc_terms_contract_fk` FOREIGN KEY (`contract_basic_detail_id`) REFERENCES `customer_master_longtermcontracts_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Master Long-term Contract Terms & Conditions';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_masters_salesorder`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_masters_salesorder`;
CREATE TABLE `customer_masters_salesorder` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `series_name` varchar(100) NOT NULL,
  `customer_category` varchar(100) DEFAULT NULL,
  `prefix` varchar(20) DEFAULT 'SO/',
  `suffix` varchar(20) DEFAULT '/24-25',
  `required_digits` int DEFAULT '4',
  `current_number` int DEFAULT '0',
  `auto_year` tinyint(1) DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_so_tenant_series_unique` (`tenant_id`,`series_name`),
  KEY `customer_so_tenant_id_idx` (`tenant_id`),
  KEY `customer_so_category_idx` (`customer_category`),
  KEY `customer_so_is_active_idx` (`is_active`),
  KEY `customer_so_is_deleted_idx` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_masters_salesquotation`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_masters_salesquotation`;
CREATE TABLE `customer_masters_salesquotation` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `series_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Name of the sales quotation series',
  `customer_category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Customer category (Retail, Wholesale, Corporate, etc.)',
  `prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'SQ/' COMMENT 'Prefix for quotation number (e.g., SQ/)',
  `suffix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '/24-25' COMMENT 'Suffix for quotation number (e.g., /24-25)',
  `required_digits` int DEFAULT '4' COMMENT 'Number of digits for sequence padding',
  `current_number` int DEFAULT '0' COMMENT 'Current number in the sequence',
  `auto_year` tinyint(1) DEFAULT '0' COMMENT 'Auto-include year in quotation number',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this series is active',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Soft delete flag',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Created by user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_sq_tenant_series_unique` (`tenant_id`,`series_name`),
  KEY `customer_sq_tenant_id_idx` (`tenant_id`),
  KEY `customer_sq_category_idx` (`customer_category`),
  KEY `customer_sq_is_active_idx` (`is_active`),
  KEY `customer_sq_is_deleted_idx` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Portal - Sales Quotation Series Configuration';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_transaction`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_transaction`;
CREATE TABLE `customer_transaction` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `customer_id` int NOT NULL,
  `transaction_type` varchar(20) NOT NULL,
  `transaction_number` varchar(50) NOT NULL,
  `transaction_date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `tax_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(15,2) NOT NULL,
  `payment_status` varchar(20) NOT NULL DEFAULT 'pending',
  `payment_mode` varchar(50) DEFAULT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `notes` text,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `customer_transaction_tenant_id_customer_id_idx` (`tenant_id`,`customer_id`),
  KEY `customer_transaction_date_idx` (`transaction_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_transaction_salesorder_basicdetails`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_transaction_salesorder_basicdetails`;
CREATE TABLE `customer_transaction_salesorder_basicdetails` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `so_series_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SO Series Name',
  `so_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Sales Order Number (auto-generated)',
  `date` date NOT NULL COMMENT 'Sales Order Date',
  `customer_po_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Customer PO Number',
  `customer_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Customer Name',
  `branch` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Branch',
  `address` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Address',
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Email Address',
  `contact_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Contact Number',
  `gst_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'GST Number',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'SO Status: pending, approved, cancelled, completed',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_trans_so_basic_so_number_uniq` (`tenant_id`,`so_number`),
  KEY `cust_trans_so_basic_tenant_idx` (`tenant_id`),
  KEY `cust_trans_so_basic_customer_idx` (`customer_name`),
  KEY `cust_trans_so_basic_date_idx` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Transaction - Sales Order Basic Details';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_transaction_salesorder_deliveryterms`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_transaction_salesorder_deliveryterms`;
CREATE TABLE `customer_transaction_salesorder_deliveryterms` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `so_basic_detail_id` bigint NOT NULL COMMENT 'Foreign key to customer_transaction_salesorder_basicdetails',
  `deliver_at` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Delivery Address',
  `delivery_date` date DEFAULT NULL COMMENT 'Delivery Date',
  `third_party_address` json DEFAULT NULL COMMENT 'Third Party Delivery Address Details',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_trans_so_delivery_basic_detail_uniq` (`so_basic_detail_id`),
  KEY `cust_trans_so_delivery_tenant_idx` (`tenant_id`),
  CONSTRAINT `cust_trans_so_delivery_basic_detail_fk` FOREIGN KEY (`so_basic_detail_id`) REFERENCES `customer_transaction_salesorder_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Transaction - Sales Order Delivery Terms';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_transaction_salesorder_items`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_transaction_salesorder_items`;
CREATE TABLE `customer_transaction_salesorder_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `so_basic_detail_id` bigint NOT NULL COMMENT 'Foreign key to customer_transaction_salesorder_basicdetails',
  `item_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Item Code',
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Item Name',
  `quantity` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Quantity',
  `price` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Price per unit',
  `taxable_value` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Taxable Value (Qty * Price)',
  `gst` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'GST Amount',
  `gst_rate` decimal(5,2) DEFAULT '0.00' COMMENT 'GST Rate (%)',
  `net_value` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Net Value (Taxable + GST)',
  `uom` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Unit of Measure',
  `packing_notes` text COLLATE utf8mb4_unicode_ci COMMENT 'Packing notes for this item',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `cust_trans_so_items_tenant_idx` (`tenant_id`),
  KEY `cust_trans_so_items_basic_detail_idx` (`so_basic_detail_id`),
  CONSTRAINT `cust_trans_so_items_basic_detail_fk` FOREIGN KEY (`so_basic_detail_id`) REFERENCES `customer_transaction_salesorder_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Transaction - Sales Order Items';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_transaction_salesorder_payment_salesperson`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_transaction_salesorder_payment_salesperson`;
CREATE TABLE `customer_transaction_salesorder_payment_salesperson` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `so_basic_detail_id` bigint NOT NULL COMMENT 'Foreign key to customer_transaction_salesorder_basicdetails',
  `credit_period` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Credit Period',
  `salesperson_in_charge` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Salesperson In Charge',
  `employee_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Employee ID / Agent ID',
  `employee_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Employee Name / Agent Name',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_trans_so_pay_sp_basic_detail_uniq` (`so_basic_detail_id`),
  KEY `cust_trans_so_pay_sp_tenant_idx` (`tenant_id`),
  CONSTRAINT `cust_trans_so_pay_sp_basic_detail_fk` FOREIGN KEY (`so_basic_detail_id`) REFERENCES `customer_transaction_salesorder_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Transaction - Sales Order Payment and Salesperson';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_transaction_salesorder_quotation_details`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_transaction_salesorder_quotation_details`;
CREATE TABLE `customer_transaction_salesorder_quotation_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `so_basic_detail_id` bigint NOT NULL COMMENT 'Foreign key to customer_transaction_salesorder_basicdetails',
  `quotation_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Type: Sales Quotation or Contract',
  `quotation_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sales Quotation # / Contract #',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cust_trans_so_quote_basic_detail_uniq` (`so_basic_detail_id`),
  KEY `cust_trans_so_quote_tenant_idx` (`tenant_id`),
  CONSTRAINT `cust_trans_so_quote_basic_detail_fk` FOREIGN KEY (`so_basic_detail_id`) REFERENCES `customer_transaction_salesorder_basicdetails` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer Transaction - Sales Order Quotation Details';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_transaction_salesquotation_general`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_transaction_salesquotation_general`;
CREATE TABLE `customer_transaction_salesquotation_general` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quote_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `effective_from` date DEFAULT NULL,
  `effective_to` date DEFAULT NULL,
  `items` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_trans_salesquotation_gen_quote_uniq` (`quote_number`),
  KEY `customer_trans_salesquotation_gen_tenant_idx` (`tenant_id`,`quote_number`),
  KEY `customer_trans_salesquotation_gen_eff_from_idx` (`effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_transaction_salesquotation_specific`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `customer_transaction_salesquotation_specific`;
CREATE TABLE `customer_transaction_salesquotation_specific` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quote_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` longtext COLLATE utf8mb4_unicode_ci,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `validity_from` date DEFAULT NULL,
  `validity_to` date DEFAULT NULL,
  `tentative_delivery_date` date DEFAULT NULL,
  `payment_terms` longtext COLLATE utf8mb4_unicode_ci,
  `items` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_trans_salesquotation_spec_quote_uniq` (`quote_number`),
  KEY `customer_trans_salesquotation_spec_tenant_idx` (`tenant_id`,`quote_number`),
  KEY `customer_trans_salesquotation_spec_val_from_idx` (`validity_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
-- Table structure for table `entries`
--


--
-- Table structure for table `vendor_master_vendorcreation_basicdetail`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vendor_master_vendorcreation_basicdetail`;
CREATE TABLE `vendor_master_vendorcreation_basicdetail` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `vendor_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Vendor code (auto-generated or manual)',
  `vendor_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Vendor name',
  `pan_no` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'PAN number',
  `contact_person` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Contact person name',
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Email address',
  `contact_no` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Contact number',
  `vendor_category` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Vendor category',
  `billing_currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Billing currency',
  `is_also_customer` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Is this vendor also a customer?',
  `tcs_applicable` tinyint(1) DEFAULT '0' COMMENT 'Is TCS applicable for this vendor?',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this vendor is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Created by user',
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Updated by user',
  `ledger_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vendor_basicdetail_tenant_code_unique` (`tenant_id`,`vendor_code`),
  KEY `vendor_basicdetail_tenant_id_idx` (`tenant_id`),
  KEY `vendor_basicdetail_tenant_name_idx` (`tenant_id`,`vendor_name`),
  KEY `vendor_basicdetail_email_idx` (`email`),
  KEY `vendor_basicdetail_pan_idx` (`pan_no`),
  KEY `fk_vendor_ledger` (`ledger_id`),
  CONSTRAINT `fk_vendor_ledger` FOREIGN KEY (`ledger_id`) REFERENCES `master_ledgers` (`id`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master Basic Details for vendor creation';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vouchers`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vouchers`;
CREATE TABLE `vouchers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `type` varchar(20) NOT NULL,
  `voucher_number` varchar(50) NOT NULL,
  `date` date NOT NULL,
  `party` varchar(255) DEFAULT NULL,
  `account` varchar(255) DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT NULL,
  `total` decimal(15,2) DEFAULT NULL,
  `narration` longtext,
  `invoice_no` varchar(50) DEFAULT NULL,
  `is_inter_state` tinyint(1) DEFAULT NULL,
  `total_taxable_amount` decimal(15,2) DEFAULT NULL,
  `total_cgst` decimal(15,2) DEFAULT NULL,
  `total_sgst` decimal(15,2) DEFAULT NULL,
  `total_igst` decimal(15,2) DEFAULT NULL,
  `total_debit` decimal(15,2) DEFAULT NULL,
  `total_credit` decimal(15,2) DEFAULT NULL,
  `from_account` varchar(255) DEFAULT NULL,
  `to_account` varchar(255) DEFAULT NULL,
  `items_data` json DEFAULT NULL,
  `dummy_force` int DEFAULT NULL,
  `source` varchar(50) DEFAULT NULL,
  `reference_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vouchers_voucher_number_tenant_id_type_df60c32e_uniq` (`voucher_number`,`tenant_id`,`type`),
  KEY `vouchers_tenant_id_3bd1aa70` (`tenant_id`),
  KEY `vouchers_type_567f73_idx` (`type`,`tenant_id`,`date`),
  KEY `vouchers_tenant__6180d8_idx` (`tenant_id`,`date`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping routines for database 'Finpixe_AI_Accounting'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-23 12:42:32
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `entries`;
CREATE TABLE `entries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `voucher_id` bigint NOT NULL,
  `voucher_number` varchar(50) DEFAULT NULL,
  `transaction_date` date DEFAULT NULL,
  `narration` text,
  `voucher_type` varchar(50) NOT NULL,
  `ledger_id` bigint DEFAULT NULL COMMENT 'FK to master_ledgers',
  `ledger_name` varchar(255) DEFAULT NULL,
  `debit` decimal(15,2) NOT NULL DEFAULT '0.00',
  `credit` decimal(15,2) NOT NULL DEFAULT '0.00',
  `customer_id` bigint DEFAULT NULL,
  `vendor_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `journal_entries_tenant_id_ce8858b9` (`tenant_id`),
  KEY `journal_ent_voucher_73bcf1_idx` (`voucher_id`,`tenant_id`),
  KEY `fk_ledger` (`ledger_id`),
  KEY `idx_voucher` (`tenant_id`,`voucher_type`,`voucher_id`),
  KEY `idx_ledger` (`tenant_id`,`ledger_id`),
  KEY `fk_entries_customer` (`customer_id`),
  KEY `fk_entries_vendor` (`vendor_id`),
  CONSTRAINT `fk_entries_customer` FOREIGN KEY (`customer_id`) REFERENCES `customer_master_customer_basicdetails` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_entries_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_je_voucher` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ledger` FOREIGN KEY (`ledger_id`) REFERENCES `master_ledgers` (`id`),
  CONSTRAINT `journal_entries_voucher_id_4cb46da5_fk_vouchers_id` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`id`),
  CONSTRAINT `chk_valid_entry` CHECK ((((`debit` > 0) and (`credit` = 0)) or ((`credit` > 0) and (`debit` = 0))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `extracted_invoices`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `extracted_invoices`;
CREATE TABLE `extracted_invoices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `voucher_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoice_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `po_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `po_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supplier_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bill_from_address` text COLLATE utf8mb4_unicode_ci,
  `ship_from_address` text COLLATE utf8mb4_unicode_ci,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sales_person` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gstin` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pan` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msme_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_terms` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_terms` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ledger_amount` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ledger_rate` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ledger_amount_dr_cr` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ledger_narration` text COLLATE utf8mb4_unicode_ci,
  `description_of_ledger` text COLLATE utf8mb4_unicode_ci,
  `type_of_tax_payment` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_description` text COLLATE utf8mb4_unicode_ci,
  `quantity` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity_uom` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_rate` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `disc_pct` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_amount` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `marks` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `no_of_packages` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `freight_charges` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hsn_sac_details` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gst_rate` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `igst_amount` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cgst_amount` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sgst_utgst_amount` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cess_rate` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cess_amount` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state_cess_rate` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state_cess_amount` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `applicable_for_reverse_charge` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `taxable_value` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoice_value` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `additional_fields` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_extracted_tenant` (`tenant_id`),
  KEY `idx_extracted_invoice` (`invoice_number`),
  KEY `idx_extracted_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `extraction_performance`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `extraction_performance`;
CREATE TABLE `extraction_performance` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `file_count` int NOT NULL DEFAULT '1',
  `processing_time_seconds` double NOT NULL,
  `timestamp` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gst_apiusagelog`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `gst_apiusagelog`;
CREATE TABLE `gst_apiusagelog` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `api_name` varchar(255) NOT NULL,
  `request_data` json DEFAULT NULL,
  `response_status` int DEFAULT NULL,
  `response_data` json DEFAULT NULL,
  `error_message` text,
  `created_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `gst_apiusagelog_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `hsn_gst_master`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `hsn_gst_master`;
CREATE TABLE `hsn_gst_master` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `hsn_code` varchar(20) NOT NULL,
  `description` text,
  `sgst_utgst` decimal(5,2) DEFAULT NULL,
  `igst` decimal(5,2) DEFAULT NULL,
  `cgst` decimal(5,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hsn_code` (`hsn_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_master_category`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_master_category`;
CREATE TABLE `inventory_master_category` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `group` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `subgroup` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `sub_subgroup` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_master_category_uniq` (`tenant_id`,`category`(100),`group`(100),`subgroup`(100),`sub_subgroup`(100)),
  KEY `inventory_master_category_tenant_id_idx` (`tenant_id`),
  KEY `inventory_master_category_is_active_idx` (`tenant_id`,`is_active`),
  KEY `inventory_master_category_category_idx` (`category`(100)),
  CONSTRAINT `inventory_master_category_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_master_grn`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_master_grn`;
CREATE TABLE `inventory_master_grn` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `name` varchar(255) NOT NULL,
  `grn_type` varchar(100) NOT NULL,
  `prefix` varchar(50) DEFAULT NULL,
  `suffix` varchar(50) DEFAULT NULL,
  `year` char(4) DEFAULT NULL,
  `required_digits` int NOT NULL DEFAULT '0',
  `preview` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_img_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_master_inventoryitems`
--


DROP TABLE IF EXISTS `inventory_master_inventoryitems`;
CREATE TABLE `inventory_master_inventoryitems` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` char(36) NOT NULL,
    
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
    `reorder_level_2` VARCHAR(255) DEFAULT NULL COMMENT 'Alternate Unit Reorder Level Information',
    `is_saleable` TINYINT(1) NOT NULL DEFAULT 0,
    
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
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
-- Table structure for table `inventory_master_issueslip`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_master_issueslip`;
CREATE TABLE `inventory_master_issueslip` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `name` varchar(255) NOT NULL,
  `issue_slip_type` varchar(100) NOT NULL,
  `prefix` varchar(50) DEFAULT NULL,
  `suffix` varchar(50) DEFAULT NULL,
  `year` char(4) DEFAULT NULL,
  `required_digits` int NOT NULL DEFAULT '0',
  `preview` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_imi_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_master_location`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_master_location`;
CREATE TABLE `inventory_master_location` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Location name',
  `location_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Type of location (predefined or custom)',
  `address_line1` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'Address Line 1 (Required)',
  `address_line2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Address Line 2 (Optional)',
  `address_line3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Address Line 3 (Optional)',
  `city` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'City',
  `state` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'State',
  `country` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'India' COMMENT 'Country',
  `pincode` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'Pincode/Zip Code',
  `vendor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Vendor/Agent Name',
  `customer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Customer Name',
  `location_address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Location Address Reference',
  `gstin` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'GSTIN (Optional)',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `inventory_master_location_tenant_id_idx` (`tenant_id`),
  KEY `inventory_master_location_name_idx` (`tenant_id`,`name`),
  CONSTRAINT `inventory_master_location_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Inventory Master Location - Stores warehouse/storage locations';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_operation_consumption`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_operation_consumption`;
CREATE TABLE `inventory_operation_consumption` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `goods_from_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `goods_to_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_note` text COLLATE utf8mb4_unicode_ci,
  `items` json DEFAULT NULL COMMENT 'List of items: item_code, quantity, rate, etc.',
  `delivery_challan` json DEFAULT NULL,
  `eway_bill_details` json DEFAULT NULL,
  `dispatch_from` text COLLATE utf8mb4_unicode_ci,
  `mode_of_transport` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dispatch_date` date DEFAULT NULL,
  `dispatch_time` time DEFAULT NULL,
  `delivery_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_gr_consignment` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ioc_tenant` (`tenant_id`),
  KEY `idx_ioc_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_operation_interunit`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_operation_interunit`;
CREATE TABLE `inventory_operation_interunit` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `goods_from_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `goods_to_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_note` text COLLATE utf8mb4_unicode_ci,
  `irn` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ack_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `items` json DEFAULT NULL COMMENT 'List of items: item_code, quantity, rate, value, etc.',
  `delivery_challan` json DEFAULT NULL,
  `eway_bill_details` json DEFAULT NULL,
  `dispatch_from` text COLLATE utf8mb4_unicode_ci,
  `mode_of_transport` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dispatch_date` date DEFAULT NULL,
  `dispatch_time` time DEFAULT NULL,
  `delivery_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_gr_consignment` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ioi_tenant` (`tenant_id`),
  KEY `idx_ioi_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_operation_jobwork`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_operation_jobwork`;
CREATE TABLE `inventory_operation_jobwork` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `operation_type` enum('outward','receipt') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'outward: Goods sent, receipt: Goods received back',
  `transaction_date` date DEFAULT NULL COMMENT 'Date of operation (issueSlipDate)',
  `transaction_time` time DEFAULT NULL COMMENT 'Time of operation (issueSlipTime)',
  `location_id` bigint DEFAULT NULL COMMENT 'Issued From / Received At Location (goodsFromLocation)',
  `job_work_outward_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Jobwork Outward No (issueSlipNumber)',
  `po_reference_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Purchase Order Reference No (jobWorkOrderNo)',
  `job_work_receipt_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Job work Receipt No (jobWorkReceiptNo)',
  `related_outward_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Reference to Job Work Outward No (jobWorkOutwardRefNo)',
  `vendor_delivery_challan_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Vendor Return Delivery Challan No (vendorDeliveryChallan)',
  `supplier_invoice_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Supplier Invoice No (outwardSupplierInvoice)',
  `vendor_id` bigint DEFAULT NULL COMMENT 'Vendor ID',
  `vendor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Vendor Name',
  `vendor_branch` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Vendor Branch',
  `vendor_address` text COLLATE utf8mb4_unicode_ci COMMENT 'Vendor Address',
  `vendor_gstin` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Vendor GSTIN',
  `items` json DEFAULT NULL COMMENT 'List of items: item_id, item_code, item_name, uom, quantity, rate, taxable_value, consumed_qty, etc.',
  `delivery_challan` json DEFAULT NULL,
  `eway_bill_details` json DEFAULT NULL,
  `dispatch_from` text COLLATE utf8mb4_unicode_ci,
  `mode_of_transport` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dispatch_date` date DEFAULT NULL,
  `dispatch_time` time DEFAULT NULL,
  `delivery_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_gr_consignment` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_note` text COLLATE utf8mb4_unicode_ci COMMENT 'Posting Note',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Draft' COMMENT 'Status: Draft, Posted, Cancelled',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_jobwork_tenant` (`tenant_id`),
  KEY `idx_jobwork_operation_type` (`operation_type`),
  KEY `idx_jobwork_outward_no` (`job_work_outward_no`),
  KEY `idx_jobwork_receipt_no` (`job_work_receipt_no`),
  KEY `idx_jobwork_vendor` (`vendor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Inventory Jobwork Operations';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_operation_locationchange`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_operation_locationchange`;
CREATE TABLE `inventory_operation_locationchange` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `goods_from_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `goods_to_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_note` text COLLATE utf8mb4_unicode_ci,
  `items` json DEFAULT NULL COMMENT 'List of items: item_code, quantity, rate, value, etc.',
  `delivery_challan` json DEFAULT NULL,
  `eway_bill_details` json DEFAULT NULL,
  `dispatch_from` text COLLATE utf8mb4_unicode_ci,
  `mode_of_transport` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dispatch_date` date DEFAULT NULL,
  `dispatch_time` time DEFAULT NULL,
  `delivery_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_gr_consignment` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_iolc_tenant` (`tenant_id`),
  KEY `idx_iolc_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_operation_new_grn`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_operation_new_grn`;
CREATE TABLE `inventory_operation_new_grn` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `grn_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'purchases' COMMENT 'purchases, sales_return',
  `grn_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `grn_series_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `location_id` bigint DEFAULT NULL,
  `vendor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `gstin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'PO No or Sales Voucher No',
  `secondary_ref_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Supplier Inv No or Debit Note No',
  `return_reason` text COLLATE utf8mb4_unicode_ci,
  `posting_note` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Posted',
  `items` json DEFAULT NULL COMMENT 'List of items: item_code, uom, received_qty, accepted_qty, etc.',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_operation_outward`
--

DROP TABLE IF EXISTS `inventory_operation_outward`;
CREATE TABLE `inventory_operation_outward` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  `outward_slip_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `outward_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sales',

  `location_id` bigint DEFAULT NULL,
  `sales_order_no` varchar(100) DEFAULT NULL,

  `customer_name` varchar(255) DEFAULT NULL,
  `supplier_invoice_no` varchar(100) DEFAULT NULL,
  `vendor_name` varchar(255) DEFAULT NULL,
  `branch` varchar(100) DEFAULT NULL,
  `address` text,

  `gstin` varchar(20) DEFAULT NULL,
  `total_boxes` varchar(50) DEFAULT NULL,
  `posting_note` text,

  `items` json DEFAULT NULL,
  `delivery_challan` json DEFAULT NULL,
  `eway_bill_details` json DEFAULT NULL,

  `dispatch_from` text,
  `mode_of_transport` varchar(100) DEFAULT NULL,
  `dispatch_date` date DEFAULT NULL,
  `dispatch_time` time DEFAULT NULL,
  `delivery_type` varchar(100) DEFAULT NULL,

  `transporter_id` varchar(100) DEFAULT NULL,
  `transporter_name` varchar(255) DEFAULT NULL,
  `vehicle_no` varchar(100) DEFAULT NULL,
  `lr_gr_consignment` varchar(100) DEFAULT NULL,

  `customer_id` bigint DEFAULT NULL,
  `status` varchar(20) DEFAULT 'PENDING',

  PRIMARY KEY (`id`),

  KEY `idx_ioo_tenant` (`tenant_id`),
  KEY `idx_ioo_outward_slip` (`outward_slip_no`),
  KEY `idx_ioo_location` (`location_id`),
  KEY `fk_outward_customer` (`customer_id`),

  CONSTRAINT `fk_outward_customer`
    FOREIGN KEY (`customer_id`)
    REFERENCES `customer_master_customer_basicdetails` (`id`)
    ON DELETE SET NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Table structure for table `inventory_operation_production`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_operation_production`;
CREATE TABLE `inventory_operation_production` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `goods_from_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `goods_to_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_note` text COLLATE utf8mb4_unicode_ci,
  `production_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'materials_issued' COMMENT 'materials_issued, inter_process, finished_goods',
  `material_issue_slip_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `process_transfer_slip_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `finished_goods_production_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `batch_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `items` json DEFAULT NULL COMMENT 'List of items with type (input/output/waste), quantity, rate, etc.',
  `delivery_challan` json DEFAULT NULL,
  `eway_bill_details` json DEFAULT NULL,
  `dispatch_from` text COLLATE utf8mb4_unicode_ci,
  `mode_of_transport` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dispatch_date` date DEFAULT NULL,
  `dispatch_time` time DEFAULT NULL,
  `delivery_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_gr_consignment` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_iop_tenant` (`tenant_id`),
  KEY `idx_iop_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_operation_scrap`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_operation_scrap`;
CREATE TABLE `inventory_operation_scrap` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `issue_slip_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `goods_from_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `goods_to_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_note` text COLLATE utf8mb4_unicode_ci,
  `items` json DEFAULT NULL COMMENT 'List of items: item_code, quantity, value, etc.',
  `delivery_challan` json DEFAULT NULL,
  `eway_bill_details` json DEFAULT NULL,
  `dispatch_from` text COLLATE utf8mb4_unicode_ci,
  `mode_of_transport` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dispatch_date` date DEFAULT NULL,
  `dispatch_time` time DEFAULT NULL,
  `delivery_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_gr_consignment` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ios_tenant` (`tenant_id`),
  KEY `idx_ios_issue_slip` (`issue_slip_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_unit`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `inventory_unit`;
CREATE TABLE `inventory_unit` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Number',
  `symbol` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'nos',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `inventory_unit_tenant_id_idx` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Inventory Units of Measure';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invoice_ocr_temp`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `invoice_ocr_temp`;
CREATE TABLE `invoice_ocr_temp` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `file_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ocr_raw_text` longtext COLLATE utf8mb4_unicode_ci,
  `extracted_data` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `upload_session_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `processed` tinyint(1) DEFAULT '0',
  `validation_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `matched_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `conflict_message` text COLLATE utf8mb4_unicode_ci,
  `vendor_id` bigint DEFAULT NULL,
  `voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_hash_tenant` (`file_hash`,`tenant_id`),
  KEY `idx_ocr_temp_expires` (`expires_at`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invoice_processing_items`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `invoice_processing_items`;
CREATE TABLE `invoice_processing_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `job_id` bigint NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `result_json` json DEFAULT NULL,
  `error_message` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `retry_count` int DEFAULT '0',
  `parent_item_id` bigint DEFAULT NULL,
  `page_number` int DEFAULT '1',
  `page_count` int DEFAULT '1',
  `processed_pages` int DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_page_per_item` (`job_id`,`page_number`,`parent_item_id`),
  KEY `invoice_processing_items_job_id_idx` (`job_id`),
  KEY `invoice_processing_items_hash_idx` (`file_hash`),
  KEY `invoice_processing_items_status_idx` (`status`),
  CONSTRAINT `invoice_processing_items_job_fk` FOREIGN KEY (`job_id`) REFERENCES `bulk_invoice_jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_hierarchy_raw`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_hierarchy_raw`;
CREATE TABLE `master_hierarchy_raw` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `type_of_business_1` text COLLATE utf8mb4_unicode_ci,
  `financial_reporting_1` text COLLATE utf8mb4_unicode_ci,
  `major_group_1` text COLLATE utf8mb4_unicode_ci,
  `group_1` text COLLATE utf8mb4_unicode_ci,
  `sub_group_1_1` text COLLATE utf8mb4_unicode_ci,
  `sub_group_2_1` text COLLATE utf8mb4_unicode_ci,
  `sub_group_3_1` text COLLATE utf8mb4_unicode_ci,
  `ledger_1` text COLLATE utf8mb4_unicode_ci,
  `code` text COLLATE utf8mb4_unicode_ci,
  `type_of_business_2` text COLLATE utf8mb4_unicode_ci,
  `financial_reporting_2` text COLLATE utf8mb4_unicode_ci,
  `major_group_2` text COLLATE utf8mb4_unicode_ci,
  `group_2` text COLLATE utf8mb4_unicode_ci,
  `sub_group_1_2` text COLLATE utf8mb4_unicode_ci,
  `sub_group_2_2` text COLLATE utf8mb4_unicode_ci,
  `sub_group_3_2` text COLLATE utf8mb4_unicode_ci,
  `ledger_2` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_ledger_groups`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_ledger_groups`;
CREATE TABLE `master_ledger_groups` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `parent` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `master_ledger_groups_name_tenant_id_7f67aa3f_uniq` (`name`,`tenant_id`),
  KEY `master_ledger_groups_tenant_id_b55cdb7c` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_voucher_contra`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_voucher_contra`;
CREATE TABLE `master_voucher_contra` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT '1' COMMENT 'Starting number',
  `current_number` int DEFAULT '1' COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT '4' COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT '1' COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_contra` (`tenant_id`),
  KEY `idx_voucher_name_contra` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Contra Voucher Master';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_voucher_creditnote`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_voucher_creditnote`;
CREATE TABLE `master_voucher_creditnote` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT '1' COMMENT 'Starting number',
  `current_number` int DEFAULT '1' COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT '4' COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT '1' COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_creditnote` (`tenant_id`),
  KEY `idx_voucher_name_creditnote` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Credit Note Voucher Master';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_voucher_debitnote`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_voucher_debitnote`;
CREATE TABLE `master_voucher_debitnote` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT '1' COMMENT 'Starting number',
  `current_number` int DEFAULT '1' COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT '4' COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT '1' COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_debitnote` (`tenant_id`),
  KEY `idx_voucher_name_debitnote` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Debit Note Voucher Master';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_voucher_expenses`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_voucher_expenses`;
CREATE TABLE `master_voucher_expenses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT '1' COMMENT 'Starting number',
  `current_number` int DEFAULT '1' COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT '4' COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT '1' COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_expenses` (`tenant_id`),
  KEY `idx_voucher_name_expenses` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Expenses Voucher Master';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_voucher_journal`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_voucher_journal`;
CREATE TABLE `master_voucher_journal` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT '1' COMMENT 'Starting number',
  `current_number` int DEFAULT '1' COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT '4' COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT '1' COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_journal` (`tenant_id`),
  KEY `idx_voucher_name_journal` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Journal Voucher Master';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_voucher_payments`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_voucher_payments`;
CREATE TABLE `master_voucher_payments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT '1' COMMENT 'Starting number',
  `current_number` int DEFAULT '1' COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT '4' COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT '1' COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_payments` (`tenant_id`),
  KEY `idx_voucher_name_payments` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Payments Voucher Master';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_voucher_purchases`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_voucher_purchases`;
CREATE TABLE `master_voucher_purchases` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT '1' COMMENT 'Starting number',
  `current_number` int DEFAULT '1' COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT '4' COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT '1' COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_purchases` (`tenant_id`),
  KEY `idx_voucher_name_purchases` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Purchases Voucher Master';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_voucher_receipts`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_voucher_receipts`;
CREATE TABLE `master_voucher_receipts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT '1' COMMENT 'Starting number',
  `current_number` int DEFAULT '1' COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT '4' COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT '1' COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_receipts` (`tenant_id`),
  KEY `idx_voucher_name_receipts` (`voucher_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Receipts Voucher Master';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_voucher_sales`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `master_voucher_sales`;
CREATE TABLE `master_voucher_sales` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `voucher_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Voucher name',
  `prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Prefix for voucher number',
  `suffix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Suffix for voucher number',
  `start_from` int DEFAULT '1' COMMENT 'Starting number',
  `current_number` int DEFAULT '1' COMMENT 'Current number in sequence',
  `required_digits` int DEFAULT '4' COMMENT 'Number of digits for padding',
  `enable_auto_numbering` tinyint(1) DEFAULT '1' COMMENT 'Enable automatic numbering',
  `include_from_existing_series` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Include from existing series (dropdown selection)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_sales` (`tenant_id`),
  KEY `idx_voucher_name_sales` (`voucher_name`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Sales Voucher Master';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `password` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_login` datetime(6) DEFAULT NULL,
  `is_superuser` tinyint(1) NOT NULL DEFAULT '0',
  `username` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_staff` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `date_joined` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `phone` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone_verified` tinyint(1) NOT NULL DEFAULT '0',
  `email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `selected_plan` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logo_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `login_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'Offline',
  `last_activity` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `subscription_start_date` date DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `users_tenant_id_idx` (`tenant_id`),
  CONSTRAINT `users_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `password_reset_otps`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `password_reset_otps`;
CREATE TABLE `password_reset_otps` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `otp_hash` varchar(255) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `attempts` int NOT NULL DEFAULT '0',
  `used` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `password_reset_otps_user_id_fk` (`user_id`),
  CONSTRAINT `password_reset_otps_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_employee_basic_details`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `payroll_employee_basic_details`;
CREATE TABLE `payroll_employee_basic_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `gender` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` longtext COLLATE utf8mb4_unicode_ci,
  `status` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_code` (`employee_code`),
  UNIQUE KEY `payroll_employee_basic_d_tenant_id_employee_code_01313797_uniq` (`tenant_id`,`employee_code`),
  KEY `payroll_employee_basic_details_tenant_id_b56eac73` (`tenant_id`),
  KEY `payroll_emp_tenant__3c85ef_idx` (`tenant_id`,`status`),
  KEY `payroll_emp_employe_d77d0c_idx` (`employee_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_employee_bank_details`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `payroll_employee_bank_details`;
CREATE TABLE `payroll_employee_bank_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `account_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ifsc_code` varchar(11) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `employee_basic_id` bigint NOT NULL,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_basic_id` (`employee_basic_id`),
  KEY `idx_tenant` (`tenant_id`),
  CONSTRAINT `payroll_employee_ban_employee_basic_id_0c5268e7_fk_payroll_e` FOREIGN KEY (`employee_basic_id`) REFERENCES `payroll_employee_basic_details` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_employee_employment`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `payroll_employee_employment`;
CREATE TABLE `payroll_employee_employment` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `department` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `designation` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_joining` date DEFAULT NULL,
  `employment_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `employee_basic_id` bigint NOT NULL,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_basic_id` (`employee_basic_id`),
  KEY `idx_tenant` (`tenant_id`),
  CONSTRAINT `payroll_employee_emp_employee_basic_id_362bd41e_fk_payroll_e` FOREIGN KEY (`employee_basic_id`) REFERENCES `payroll_employee_basic_details` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_employee_salary`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `payroll_employee_salary`;
CREATE TABLE `payroll_employee_salary` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `basic_salary` decimal(12,2) NOT NULL,
  `hra` decimal(12,2) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `employee_basic_id` bigint NOT NULL,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_basic_id` (`employee_basic_id`),
  KEY `idx_tenant` (`tenant_id`),
  CONSTRAINT `payroll_employee_sal_employee_basic_id_cdfba561_fk_payroll_e` FOREIGN KEY (`employee_basic_id`) REFERENCES `payroll_employee_basic_details` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_employee_statutory`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `payroll_employee_statutory`;
CREATE TABLE `payroll_employee_statutory` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `pan_number` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uan_number` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `esi_number` varchar(17) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aadhar_number` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `employee_basic_id` bigint NOT NULL,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_basic_id` (`employee_basic_id`),
  KEY `idx_tenant` (`tenant_id`),
  CONSTRAINT `payroll_employee_sta_employee_basic_id_893b5c6c_fk_payroll_e` FOREIGN KEY (`employee_basic_id`) REFERENCES `payroll_employee_basic_details` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_pay_run`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `payroll_pay_run`;
CREATE TABLE `payroll_pay_run` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pay_run_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pay_period` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `payment_date` date DEFAULT NULL,
  `total_employees` int NOT NULL DEFAULT '0',
  `gross_pay` decimal(15,2) NOT NULL DEFAULT '0.00',
  `total_deductions` decimal(15,2) NOT NULL DEFAULT '0.00',
  `net_pay` decimal(15,2) NOT NULL DEFAULT '0.00',
  `processed_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pay_run_code` (`pay_run_code`),
  UNIQUE KEY `payroll_pay_run_tenant_id_pay_run_code_fecb4a42_uniq` (`tenant_id`,`pay_run_code`),
  KEY `payroll_pay_run_tenant_id_44d7dcb5` (`tenant_id`),
  KEY `payroll_pay_tenant__859fa0_idx` (`tenant_id`,`status`),
  KEY `payroll_pay_start_d_0e9a8e_idx` (`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_salary_template`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `payroll_salary_template`;
CREATE TABLE `payroll_salary_template` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `template_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payroll_salary_template_tenant_id_template_name_f5ff8dfa_uniq` (`tenant_id`,`template_name`),
  KEY `payroll_salary_template_tenant_id_27fcb732` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `questions`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `questions`;
CREATE TABLE `questions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `sub_group_1_2` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sub_group_1_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `question` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `condition_rule` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sg1_question` (`sub_group_1_2`,`question`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rbac_roles`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `rbac_roles`;
CREATE TABLE `rbac_roles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Role name (e.g., Accountant)',
  `description` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Role description',
  `permissions` json NOT NULL COMMENT 'Hierarchical permissions structure (page -> tabs)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this role is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_roles_tenant_name_unique` (`tenant_id`,`name`),
  KEY `rbac_roles_tenant_id_idx` (`tenant_id`),
  CONSTRAINT `rbac_roles_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RBAC Roles';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rbac_user_roles`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `rbac_user_roles`;
CREATE TABLE `rbac_user_roles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint NOT NULL COMMENT 'User assigned to this role',
  `role_id` bigint NOT NULL COMMENT 'Role assigned to the user',
  `username` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Snapshot of username',
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Snapshot of email',
  `phone` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Snapshot of phone',
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
  CONSTRAINT `rbac_user_roles_assigned_by_fk` FOREIGN KEY (`assigned_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `rbac_user_roles_role_fk` FOREIGN KEY (`role_id`) REFERENCES `rbac_roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rbac_user_roles_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rbac_user_roles_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RBAC User Role Assignments';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_invoices`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `sales_invoices`;
CREATE TABLE `sales_invoices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `invoice_number` varchar(50) NOT NULL,
  `invoice_date` date NOT NULL,
  `voucher_type_id` bigint NOT NULL,
  `customer_id` bigint NOT NULL,
  `bill_to_address` longtext NOT NULL,
  `bill_to_gstin` varchar(15) DEFAULT NULL,
  `bill_to_contact` varchar(255) DEFAULT NULL,
  `bill_to_state` varchar(100) DEFAULT NULL,
  `bill_to_country` varchar(100) NOT NULL,
  `ship_to_address` longtext NOT NULL,
  `ship_to_state` varchar(100) DEFAULT NULL,
  `ship_to_country` varchar(100) NOT NULL,
  `tax_type` varchar(20) NOT NULL,
  `status` varchar(20) NOT NULL,
  `current_step` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sales_invoices_tenant_id_invoice_number_196b3ec1_uniq` (`tenant_id`,`invoice_number`),
  KEY `sales_invoices_tenant_id_03076e3d` (`tenant_id`),
  KEY `sales_invoi_tenant__62aed4_idx` (`tenant_id`,`invoice_date`),
  KEY `sales_invoi_custome_aa5d4a_idx` (`customer_id`,`tenant_id`),
  KEY `sales_invoi_voucher_e4d47a_idx` (`voucher_type_id`),
  CONSTRAINT `sales_invoices_customer_id_a0072102_fk_master_ledgers_id` FOREIGN KEY (`customer_id`) REFERENCES `master_ledgers` (`id`),
  CONSTRAINT `sales_invoices_voucher_type_id_ae2f21d9_fk_master_vo` FOREIGN KEY (`voucher_type_id`) REFERENCES `master_voucher_receipts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `service_group`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `service_group`;
CREATE TABLE `service_group` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `category` varchar(100) NOT NULL,
  `group` varchar(100) NOT NULL DEFAULT '',
  `subgroup` varchar(100) NOT NULL DEFAULT '',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `service_list`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `service_list`;
CREATE TABLE `service_list` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `service_code` varchar(50) NOT NULL,
  `service_name` varchar(255) NOT NULL,
  `service_group_id` bigint unsigned DEFAULT NULL,
  `service_group` varchar(100) DEFAULT NULL,
  `sac_code` varchar(20) DEFAULT NULL,
  `gst_rate` decimal(5,2) DEFAULT '0.00',
  `expense_ledger` varchar(255) DEFAULT NULL,
  `uom` varchar(50) DEFAULT NULL,
  `description` longtext,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_service_code` (`service_code`),
  KEY `idx_service_group` (`service_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transcaction_file`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `transcaction_file`;
CREATE TABLE `transcaction_file` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL,
  `financial_year_id` bigint NOT NULL,
  `ledger_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ledger_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alias_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `group_id` bigint DEFAULT NULL,
  `nature` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ledger_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `opening_balance` decimal(18,2) DEFAULT '0.00',
  `opening_balance_type` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_balance` decimal(18,2) DEFAULT '0.00',
  `current_balance_type` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `closing_balance` decimal(18,2) DEFAULT '0.00',
  `closing_balance_type` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ifsc_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `micr_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `upi_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gst_applicable` tinyint(1) DEFAULT '0',
  `gst_registration_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gstin` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hsn_sac_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gst_rate` decimal(5,2) DEFAULT NULL,
  `cgst_rate` decimal(5,2) DEFAULT NULL,
  `sgst_rate` decimal(5,2) DEFAULT NULL,
  `igst_rate` decimal(5,2) DEFAULT NULL,
  `is_tds_applicable` tinyint(1) DEFAULT '0',
  `tds_section` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tds_rate` decimal(5,2) DEFAULT NULL,
  `contact_person` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mobile` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pincode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vendor_master_category`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vendor_master_category`;
CREATE TABLE `vendor_master_category` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this category is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `is_system` tinyint(1) DEFAULT '0',
  `group` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `subgroup` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `sub_subgroup` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `vendor_category_tenant_unique` (`tenant_id`,`category`(100),`group`(100),`subgroup`(100),`sub_subgroup`(100)),
  KEY `vendor_category_tenant_id_idx` (`tenant_id`),
  KEY `vendor_category_is_active_idx` (`tenant_id`,`is_active`),
  KEY `vendor_category_category_idx` (`category`(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master Category - Stores vendor category hierarchy';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vendor_master_posettings`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vendor_master_posettings`;
CREATE TABLE `vendor_master_posettings` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` bigint DEFAULT NULL,
  `prefix` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `suffix` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `digits` int NOT NULL DEFAULT '4',
  `auto_year` tinyint(1) NOT NULL DEFAULT '0',
  `current_number` int NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `vendor_posettings_tenant_name_unique` (`tenant_id`,`name`),
  KEY `vendor_posettings_tenant_id_idx` (`tenant_id`),
  KEY `vendor_posettings_category_fk` (`category_id`),
  CONSTRAINT `vendor_posettings_category_fk` FOREIGN KEY (`category_id`) REFERENCES `vendor_master_category` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vendor_master_vendorcreation_banking`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vendor_master_vendorcreation_banking`;
CREATE TABLE `vendor_master_vendorcreation_banking` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
  `bank_account_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Bank Account Number',
  `bank_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Bank Name',
  `ifsc_code` varchar(11) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'IFSC Code',
  `branch_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Branch Name',
  `swift_code` varchar(11) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SWIFT Code',
  `vendor_branch` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Associate to a vendor branch',
  `account_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'current' COMMENT 'Type of bank account',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this banking detail is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Created by user',
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Updated by user',
  PRIMARY KEY (`id`),
  KEY `vendor_banking_tenant_id_idx` (`tenant_id`),
  KEY `vendor_banking_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`),
  KEY `vendor_banking_bank_account_no_idx` (`bank_account_no`),
  CONSTRAINT `vendor_banking_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master Banking Information';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vendor_master_vendorcreation_gstdetails`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vendor_master_vendorcreation_gstdetails`;
CREATE TABLE `vendor_master_vendorcreation_gstdetails` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
  `gstin` varchar(15) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'GSTIN number (15 characters)',
  `gst_registration_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'regular' COMMENT 'GST registration type',
  `legal_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Legal name as per GST',
  `trade_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Trade/Brand name',
  `gst_state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'State of GST registration',
  `gst_state_code` varchar(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'State code (2 digits)',
  `pan_linked_with_gstin` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'PAN linked with GSTIN',
  `date_of_registration` date DEFAULT NULL COMMENT 'Date of GST registration',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this GST detail is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Created by user',
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Updated by user',
  `reference_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Branch reference name',
  `branch_address` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Branch address',
  `branch_contact_person` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Branch contact person',
  `branch_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Branch email',
  `branch_contact_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Branch contact number',
  `branch_pincode` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vendor_gstdetails_tenant_gstin_ref_unique` (`tenant_id`,`gstin`,`reference_name`),
  KEY `vendor_gstdetails_tenant_id_idx` (`tenant_id`),
  KEY `vendor_gstdetails_gstin_idx` (`gstin`),
  KEY `vendor_gstdetails_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`),
  CONSTRAINT `vendor_gstdetails_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master GST Details';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vendor_master_vendorcreation_productservices`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vendor_master_vendorcreation_productservices`;
CREATE TABLE `vendor_master_vendorcreation_productservices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
  `items` json NOT NULL DEFAULT (json_array()) COMMENT 'JSON array of product/service items; empty array [] when none added',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this record is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Created by user',
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Updated by user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `vendor_prodserv_vendor_unique` (`vendor_basic_detail_id`),
  KEY `vendor_prodserv_tenant_id_idx` (`tenant_id`),
  CONSTRAINT `vendor_prodserv_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master Products/Services (JSON array per vendor)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vendor_master_vendorcreation_tds`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vendor_master_vendorcreation_tds`;
CREATE TABLE `vendor_master_vendorcreation_tds` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
  `pan_number` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'PAN Number',
  `tan_number` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'TAN Number',
  `tds_section` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'TDS Section',
  `tds_rate` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'TDS Rate',
  `penalty_rate` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Penalty Rate',
  `tds_section_applicable` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'TDS Section Applicable',
  `enable_automatic_tds_posting` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Enable automatic TDS posting',
  `msme_udyam_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'MSME Udyam Registration Number',
  `fssai_license_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'FSSAI License Number',
  `import_export_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Import Export Code (IEC)',
  `eou_status` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Export Oriented Unit Status',
  `cin_number` varchar(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'CIN Number',
  `tcs_section_applicable` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'TCS Section Applicable',
  `tcs_rate` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'TCS Rate',
  `msme_file` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'MSME Certificate',
  `fssai_file` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'FSSAI License',
  `import_export_file` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IEC Certificate',
  `eou_file` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'EOU Certificate',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Created by user',
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Updated by user',
  PRIMARY KEY (`id`),
  KEY `vendor_tds_tenant_id_idx` (`tenant_id`),
  KEY `vendor_tds_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`),
  CONSTRAINT `vendor_tds_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master TDS & Other Statutory Details';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vendor_master_vendorcreation_terms`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vendor_master_vendorcreation_terms`;
CREATE TABLE `vendor_master_vendorcreation_terms` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
  `credit_limit` decimal(15,2) DEFAULT NULL COMMENT 'Credit limit amount',
  `credit_period` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Credit period (e.g., 30 days, 60 days)',
  `credit_terms` text COLLATE utf8mb4_unicode_ci COMMENT 'Credit terms and conditions',
  `penalty_terms` text COLLATE utf8mb4_unicode_ci COMMENT 'Penalty terms for late payments or breaches',
  `delivery_terms` text COLLATE utf8mb4_unicode_ci COMMENT 'Delivery terms, lead time, shipping conditions',
  `warranty_guarantee_details` text COLLATE utf8mb4_unicode_ci COMMENT 'Warranty and guarantee terms',
  `force_majeure` text COLLATE utf8mb4_unicode_ci COMMENT 'Force majeure clauses',
  `dispute_redressal_terms` text COLLATE utf8mb4_unicode_ci COMMENT 'Dispute resolution and redressal terms',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this terms detail is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Created by user',
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Updated by user',
  PRIMARY KEY (`id`),
  KEY `vendor_terms_tenant_id_idx` (`tenant_id`),
  KEY `vendor_terms_vendor_basic_detail_id_idx` (`vendor_basic_detail_id`),
  CONSTRAINT `vendor_terms_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Master Terms and Conditions';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vendor_transaction_po`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vendor_transaction_po`;
CREATE TABLE `vendor_transaction_po` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  `po_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Purchase Order Number',
  `po_series_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_posettings',
  `vendor_basic_detail_id` bigint DEFAULT NULL COMMENT 'Foreign key to vendor_master_vendorcreation_basicdetail',
  `vendor_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Vendor name (denormalized)',
  `branch` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Vendor branch',
  `address_line1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Address Line 1',
  `address_line2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Address Line 2',
  `address_line3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Address Line 3',
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'City',
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'State',
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Country',
  `pincode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Pincode',
  `email_address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Email Address',
  `contract_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Contract Number',
  `receive_by` date DEFAULT NULL COMMENT 'Expected receive date',
  `receive_at` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Receive at location',
  `delivery_terms` text COLLATE utf8mb4_unicode_ci COMMENT 'Delivery terms and conditions',
  `total_taxable_value` decimal(15,2) DEFAULT '0.00' COMMENT 'Total taxable value',
  `total_tax` decimal(15,2) DEFAULT '0.00' COMMENT 'Total tax amount',
  `total_value` decimal(15,2) DEFAULT '0.00' COMMENT 'Total PO value',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Draft' COMMENT 'PO Status: Draft, Pending Approval, Approved, Mailed, Closed',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this PO is active',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Created by user',
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Updated by user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `vendor_po_tenant_number_unique` (`tenant_id`,`po_number`),
  KEY `vendor_po_tenant_id_idx` (`tenant_id`),
  KEY `vendor_po_series_id_idx` (`po_series_id`),
  KEY `vendor_po_vendor_id_idx` (`vendor_basic_detail_id`),
  KEY `vendor_po_status_idx` (`status`),
  CONSTRAINT `vendor_po_series_fk` FOREIGN KEY (`po_series_id`) REFERENCES `vendor_master_posettings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `vendor_po_vendor_fk` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vendor Purchase Order Transactions';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vendor_transaction_po_items`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `vendor_transaction_po_items`;
CREATE TABLE `vendor_transaction_po_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `item_code` varchar(50) NOT NULL,
  `item_name` varchar(200) NOT NULL,
  `supplier_item_code` varchar(50) DEFAULT NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT '0.00',
  `uom` varchar(20) NOT NULL,
  `negotiated_rate` decimal(15,2) NOT NULL DEFAULT '0.00',
  `final_rate` decimal(15,2) NOT NULL DEFAULT '0.00',
  `taxable_value` decimal(15,2) NOT NULL DEFAULT '0.00',
  `gst_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `gst_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `invoice_value` decimal(15,2) NOT NULL DEFAULT '0.00',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `po_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vendor_po_items_tenant` (`tenant_id`),
  KEY `idx_vendor_po_items_po` (`po_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_contra`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_contra`;
CREATE TABLE `voucher_contra` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `date` date NOT NULL,
  `voucher_number` varchar(100) NOT NULL,
  `from_account` varchar(255) NOT NULL,
  `to_account` varchar(255) NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `narration` longtext,
  `voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_voucher_contra_tenant` (`tenant_id`),
  KEY `idx_voucher_contra_voucher` (`voucher_number`),
  KEY `idx_voucher_contra_voucher_id` (`voucher_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_expenses`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_expenses`;
CREATE TABLE `voucher_expenses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `voucher_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expense_rows` json NOT NULL,
  `posting_note` longtext COLLATE utf8mb4_unicode_ci,
  `uploaded_files` json DEFAULT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `voucher_expenses_tenant_id_idx` (`tenant_id`),
  KEY `voucher_expenses_date_idx` (`date`),
  KEY `idx_voucher_expenses_voucher_id` (`voucher_id`),
  CONSTRAINT `voucher_expenses_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_journal`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_journal`;
CREATE TABLE `voucher_journal` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `date` date NOT NULL,
  `voucher_number` varchar(100) NOT NULL,
  `total_debit` decimal(15,2) NOT NULL DEFAULT '0.00',
  `total_credit` decimal(15,2) NOT NULL DEFAULT '0.00',
  `narration` longtext,
  `entries` json NOT NULL,
  `voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_voucher_journal_tenant` (`tenant_id`),
  KEY `idx_voucher_journal_voucher` (`voucher_number`),
  KEY `idx_voucher_journal_voucher_id` (`voucher_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_payment_bulk`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_payment_bulk`;
CREATE TABLE `voucher_payment_bulk` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `voucher_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_rows` json DEFAULT NULL,
  `posting_note` longtext COLLATE utf8mb4_unicode_ci,
  `advance_ref_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `advance_amount` decimal(15,2) DEFAULT '0.00',
  `transaction_details` json DEFAULT NULL COMMENT 'List: [{date, invoiceNo, amount, payNow, pending, advance}]',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `pay_from_ledger_id` bigint DEFAULT NULL,
  `bank_reconciled` tinyint(1) NOT NULL DEFAULT '0',
  `bank_reconcile_date` date DEFAULT NULL,
  `bank_statement_id` bigint DEFAULT NULL,
  `bank_reference_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `voucher_payment_bulk_tenant_id_idx` (`tenant_id`),
  KEY `voucher_payment_bulk_date_idx` (`date`),
  KEY `fk_vpb_pay_from` (`pay_from_ledger_id`),
  KEY `idx_voucher_payment_bulk_voucher_id` (`voucher_id`),
  CONSTRAINT `fk_vpb_pay_from` FOREIGN KEY (`pay_from_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `voucher_payment_bulk_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_payment_single`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_payment_single`;
CREATE TABLE `voucher_payment_single` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `voucher_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voucher_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_payment` decimal(15,2) DEFAULT '0.00',
  `advance_ref_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `advance_amount` decimal(15,2) DEFAULT '0.00',
  `transaction_details` json DEFAULT NULL COMMENT 'List: [{date, referenceNumber, amount, payment, pending, advance}]',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `pay_from_ledger_id` bigint NOT NULL,
  `pay_to_ledger_id` bigint NOT NULL,
  `bank_reconciled` tinyint(1) NOT NULL DEFAULT '0',
  `bank_reconcile_date` date DEFAULT NULL,
  `bank_statement_id` bigint DEFAULT NULL,
  `bank_reference_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `voucher_payment_single_tenant_id_idx` (`tenant_id`),
  KEY `voucher_payment_single_date_idx` (`date`),
  KEY `fk_vps_pay_from` (`pay_from_ledger_id`),
  KEY `fk_vps_pay_to` (`pay_to_ledger_id`),
  KEY `idx_voucher_payment_single_voucher_id` (`voucher_id`),
  CONSTRAINT `fk_vps_pay_from` FOREIGN KEY (`pay_from_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_vps_pay_to` FOREIGN KEY (`pay_to_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `voucher_payment_single_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_purchase_supplier_details`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_purchase_supplier_details`;
CREATE TABLE `voucher_purchase_supplier_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `date` date NOT NULL,
  `supplier_invoice_no` varchar(100) DEFAULT NULL,
  `purchase_voucher_series` varchar(100) DEFAULT NULL,
  `supplier_invoice_date` date DEFAULT NULL,
  `purchase_voucher_no` varchar(100) DEFAULT NULL,
  `vendor_name` varchar(255) DEFAULT NULL,
  `gstin` varchar(50) DEFAULT NULL,
  `branch` varchar(255) DEFAULT NULL,
  `grn_reference` varchar(100) DEFAULT NULL,
  `bill_from` longtext,
  `ship_from` longtext,
  `input_type` varchar(50) DEFAULT NULL,
  `invoice_in_foreign_currency` varchar(10) DEFAULT NULL,
  `supporting_document` varchar(100) DEFAULT NULL,
  `vendor_basic_detail_id` bigint NOT NULL,
  `creation_source` varchar(50) DEFAULT 'manual',
  `voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vpsd_vendor_relation` (`tenant_id`),
  KEY `fk_vpsd_vendor` (`vendor_basic_detail_id`),
  KEY `idx_vpsd_voucher_id` (`voucher_id`),
  CONSTRAINT `fk_vpsd_vendor` FOREIGN KEY (`vendor_basic_detail_id`) REFERENCES `vendor_master_vendorcreation_basicdetail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_purchase_due_details`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_purchase_due_details`;
CREATE TABLE `voucher_purchase_due_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `tds_gst` decimal(15,2) DEFAULT '0.00',
  `tds_it` decimal(15,2) DEFAULT '0.00',
  `advance_paid` decimal(15,2) DEFAULT '0.00',
  `to_pay` decimal(15,2) DEFAULT '0.00',
  `posting_note` longtext,
  `terms` varchar(255) DEFAULT NULL,
  `advance_references` json DEFAULT NULL,
  `supplier_details_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vpdd_tenant` (`tenant_id`),
  KEY `idx_vpdd_supplier` (`supplier_details_id`),
  CONSTRAINT `fk_vpdd_supplier` FOREIGN KEY (`supplier_details_id`) REFERENCES `voucher_purchase_supplier_details` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_purchase_supply_foreign_details`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_purchase_supply_foreign_details`;
CREATE TABLE `voucher_purchase_supply_foreign_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `purchase_order_no` varchar(100) DEFAULT NULL,
  `exchange_rate` decimal(10,4) DEFAULT NULL,
  `description` longtext,
  `items` json DEFAULT NULL,
  `supplier_details_id` bigint NOT NULL,
  `purchase_ledger` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vpsfd_tenant` (`tenant_id`),
  KEY `idx_vpsfd_supplier` (`supplier_details_id`),
  CONSTRAINT `fk_vpsfd_supplier` FOREIGN KEY (`supplier_details_id`) REFERENCES `voucher_purchase_supplier_details` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_purchase_supply_inr_details`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_purchase_supply_inr_details`;
CREATE TABLE `voucher_purchase_supply_inr_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `purchase_order_no` varchar(100) DEFAULT NULL,
  `purchase_ledger` varchar(255) DEFAULT NULL,
  `items` json DEFAULT NULL,
  `supplier_details_id` bigint NOT NULL,
  `description` longtext,
  PRIMARY KEY (`id`),
  KEY `idx_vpsid_tenant` (`tenant_id`),
  KEY `idx_vpsid_supplier` (`supplier_details_id`),
  CONSTRAINT `fk_vpsid_supplier` FOREIGN KEY (`supplier_details_id`) REFERENCES `voucher_purchase_supplier_details` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_purchase_transit_details`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_purchase_transit_details`;
CREATE TABLE `voucher_purchase_transit_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `mode` varchar(50) DEFAULT NULL,
  `received_in` varchar(255) DEFAULT NULL,
  `receipt_date` date DEFAULT NULL,
  `receipt_time` time(6) DEFAULT NULL,
  `received_quantity` varchar(50) DEFAULT NULL,
  `uqc` varchar(50) DEFAULT NULL,
  `delivery_type` varchar(100) DEFAULT NULL,
  `self_third_party` varchar(100) DEFAULT NULL,
  `transporter_id` varchar(100) DEFAULT NULL,
  `transporter_name` varchar(255) DEFAULT NULL,
  `vehicle_no` varchar(100) DEFAULT NULL,
  `lr_gr_consignment` varchar(100) DEFAULT NULL,
  `document` varchar(100) DEFAULT NULL,
  `extra_details` json DEFAULT NULL,
  `supplier_details_id` bigint NOT NULL,
  `upto_port_origin_city` varchar(255) DEFAULT NULL,
  `upto_port_origin_country` varchar(100) DEFAULT NULL,
  `upto_port_vessel_flight_no` varchar(100) DEFAULT NULL,
  `upto_port_port_of_loading` varchar(255) DEFAULT NULL,
  `upto_port_port_of_discharge` varchar(255) DEFAULT NULL,
  `upto_port_final_dest_city` varchar(255) DEFAULT NULL,
  `upto_port_final_dest_country` varchar(100) DEFAULT NULL,
  `upto_port_rr_no` varchar(100) DEFAULT NULL,
  `upto_port_rr_date` date DEFAULT NULL,
  `upto_port_fnr_no` varchar(100) DEFAULT NULL,
  `upto_port_station_loading` varchar(255) DEFAULT NULL,
  `upto_port_station_discharge` varchar(255) DEFAULT NULL,
  `beyond_port_sb_no` varchar(100) DEFAULT NULL,
  `beyond_port_sb_date` date DEFAULT NULL,
  `beyond_port_ship_port_code` varchar(100) DEFAULT NULL,
  `beyond_port_vessel_flight_no` varchar(100) DEFAULT NULL,
  `beyond_port_port_of_loading` varchar(255) DEFAULT NULL,
  `beyond_port_port_of_discharge` varchar(255) DEFAULT NULL,
  `beyond_port_final_dest` varchar(255) DEFAULT NULL,
  `beyond_port_dest_country` varchar(100) DEFAULT NULL,
  `beyond_port_origin_country` varchar(100) DEFAULT NULL,
  `rail_beyond_rr_no` varchar(100) DEFAULT NULL,
  `rail_beyond_origin` varchar(255) DEFAULT NULL,
  `rail_beyond_rr_date` date DEFAULT NULL,
  `rail_beyond_rail_no` varchar(100) DEFAULT NULL,
  `rail_beyond_station_loading` varchar(255) DEFAULT NULL,
  `rail_beyond_origin_country` varchar(100) DEFAULT NULL,
  `rail_beyond_station_discharge` varchar(255) DEFAULT NULL,
  `rail_beyond_final_dest` varchar(255) DEFAULT NULL,
  `rail_beyond_dest_country` varchar(100) DEFAULT NULL,
  `rail_upto_delivery_type` varchar(100) DEFAULT NULL,
  `rail_upto_transporter_name` varchar(255) DEFAULT NULL,
  `rail_upto_transporter_id` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vptd_tenant` (`tenant_id`),
  KEY `idx_vptd_supplier` (`supplier_details_id`),
  CONSTRAINT `fk_vptd_supplier` FOREIGN KEY (`supplier_details_id`) REFERENCES `voucher_purchase_supplier_details` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_receipt_bulk`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_receipt_bulk`;
CREATE TABLE `voucher_receipt_bulk` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `voucher_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `receipt_rows` json DEFAULT NULL,
  `posting_note` longtext COLLATE utf8mb4_unicode_ci,
  `advance_ref_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `advance_amount` decimal(15,2) DEFAULT '0.00',
  `transaction_details` json DEFAULT NULL COMMENT 'List: [{date, invoiceNo, amount, receiveNow, pending, advance}]',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `receive_in_ledger_id` bigint DEFAULT NULL,
  `bank_reconciled` tinyint(1) NOT NULL DEFAULT '0',
  `bank_reconcile_date` date DEFAULT NULL,
  `bank_statement_id` bigint DEFAULT NULL,
  `bank_reference_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `voucher_receipt_bulk_tenant_id_idx` (`tenant_id`),
  KEY `voucher_receipt_bulk_date_idx` (`date`),
  KEY `fk_vrb_receive_in` (`receive_in_ledger_id`),
  KEY `idx_voucher_receipt_bulk_voucher_id` (`voucher_id`),
  CONSTRAINT `fk_vrb_receive_in` FOREIGN KEY (`receive_in_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `voucher_receipt_bulk_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_receipt_single`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_receipt_single`;
CREATE TABLE `voucher_receipt_single` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `voucher_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voucher_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_receipt` decimal(15,2) DEFAULT '0.00',
  `advance_ref_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `advance_amount` decimal(15,2) DEFAULT '0.00',
  `transaction_details` json DEFAULT NULL COMMENT 'List: [{date, referenceNumber, amount, receipt, pending, advance}]',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `receive_in_ledger_id` bigint NOT NULL,
  `receive_from_ledger_id` bigint NOT NULL,
  `bank_reconciled` tinyint(1) NOT NULL DEFAULT '0',
  `bank_reconcile_date` date DEFAULT NULL,
  `bank_statement_id` bigint DEFAULT NULL,
  `bank_reference_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voucher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `voucher_receipt_single_tenant_id_idx` (`tenant_id`),
  KEY `voucher_receipt_single_date_idx` (`date`),
  KEY `fk_vrs_receive_in` (`receive_in_ledger_id`),
  KEY `fk_vrs_receive_from` (`receive_from_ledger_id`),
  KEY `idx_voucher_receipt_single_voucher_id` (`voucher_id`),
  CONSTRAINT `fk_vrs_receive_from` FOREIGN KEY (`receive_from_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_vrs_receive_in` FOREIGN KEY (`receive_in_ledger_id`) REFERENCES `master_ledgers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `voucher_receipt_single_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_sales_dispatchdetails`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_sales_dispatchdetails`;
CREATE TABLE `voucher_sales_dispatchdetails` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `dispatch_from` longtext COLLATE utf8mb4_unicode_ci,
  `mode_of_transport` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dispatch_date` date DEFAULT NULL,
  `dispatch_time` time(6) DEFAULT NULL,
  `delivery_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `self_third_party` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_gr_consignment` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dispatch_document` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `upto_port_shipping_bill_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `upto_port_shipping_bill_date` date DEFAULT NULL,
  `upto_port_ship_port_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `upto_port_origin` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `beyond_port_shipping_bill_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `beyond_port_shipping_bill_date` date DEFAULT NULL,
  `beyond_port_ship_port_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `beyond_port_vessel_flight_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `beyond_port_port_of_loading` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `beyond_port_port_of_discharge` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `beyond_port_final_destination` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `beyond_port_origin_country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `beyond_port_dest_country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_upto_port_delivery_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_upto_port_transporter_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_upto_port_transporter_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_upto_port_vehicle_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_upto_port_lr_gr_consignment` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_beyond_port_receipt_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_beyond_port_receipt_date` date DEFAULT NULL,
  `rail_beyond_port_origin` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_beyond_port_origin_country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_beyond_port_rail_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_beyond_port_fnr_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_beyond_port_station_loading` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_beyond_port_station_discharge` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_beyond_port_final_destination` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rail_beyond_port_dest_country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoice_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_invoice_id` (`invoice_id`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_sales_ewaybill`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_sales_ewaybill`;
CREATE TABLE `voucher_sales_ewaybill` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `eway_bill_available` tinyint(1) DEFAULT '0',
  `eway_bill_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eway_bill_date` date DEFAULT NULL,
  `validity_period` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `distance` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extension_date` date DEFAULT NULL,
  `extended_ewb_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extension_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `from_place` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remaining_distance` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_validity` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_vehicle_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `irn` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ack_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoice_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_invoice_id` (`invoice_id`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_sales_invoicedetails`
--

DROP TABLE IF EXISTS `voucher_sales_invoicedetails`;
CREATE TABLE `voucher_sales_invoicedetails` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,

  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  `date` date DEFAULT NULL,
  `sales_invoice_no` varchar(50) DEFAULT NULL,
  `voucher_name` varchar(100) DEFAULT NULL,

  `outward_slip_no` varchar(50) DEFAULT NULL,
  `outward_slip_id` bigint DEFAULT NULL,

  `customer_name` varchar(255) DEFAULT NULL,
  `customer_id` bigint DEFAULT NULL,
  `customer_branch` varchar(100) DEFAULT NULL,

  `voucher_id` bigint DEFAULT NULL,

  `bill_to` longtext,
  `ship_to` longtext,

  `gstin` varchar(15) DEFAULT NULL,
  `contact` varchar(100) DEFAULT NULL,

  `tax_type` varchar(50) DEFAULT NULL,
  `state_type` varchar(20) DEFAULT NULL,
  `export_type` varchar(50) DEFAULT NULL,

  `exchange_rate` varchar(50) DEFAULT NULL,
  `supporting_document` varchar(100) DEFAULT NULL,
  `sales_order_no` varchar(50) DEFAULT NULL,

  `place_of_supply` varchar(2) DEFAULT NULL,
  `reverse_charge` varchar(1) DEFAULT 'N',

  `invoice_type` varchar(50) DEFAULT 'Regular',
  `gst_export_type` varchar(10) DEFAULT NULL,

  `port_code` varchar(6) DEFAULT NULL,
  `shipping_bill_number` varchar(50) DEFAULT NULL,
  `shipping_bill_date` date DEFAULT NULL,

  `ecommerce_gstin` varchar(15) DEFAULT NULL,

  `irn` varchar(255) DEFAULT NULL,
  `ack_no` varchar(100) DEFAULT NULL,

  `status` varchar(20) DEFAULT 'Due',
  `current_step` int DEFAULT 1,

  `posting_status` varchar(20) DEFAULT 'SKIPPED',
  `posting_error` text,

  PRIMARY KEY (`id`),

  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_sales_invoice_no` (`sales_invoice_no`),
  KEY `idx_sales_tenant_customer` (`tenant_id`, `customer_id`),

  KEY `fk_sales_invoice_customer` (`customer_id`),
  KEY `fk_sales_outward` (`outward_slip_id`),

  CONSTRAINT `fk_sales_invoice_customer`
    FOREIGN KEY (`customer_id`)
    REFERENCES `customer_master_customer_basicdetails` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `fk_sales_outward`
    FOREIGN KEY (`outward_slip_id`)
    REFERENCES `inventory_operation_outward` (`id`)
    ON DELETE SET NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--
-- Table structure for table `voucher_sales_items`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_sales_items`;
CREATE TABLE `voucher_sales_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `item_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hsn_sac` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qty` decimal(18,4) DEFAULT '0.0000',
  `uom` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_rate` decimal(18,2) DEFAULT '0.00',
  `taxable_value` decimal(18,2) DEFAULT '0.00',
  `igst` decimal(18,2) DEFAULT '0.00',
  `cgst` decimal(18,2) DEFAULT '0.00',
  `sgst` decimal(18,2) DEFAULT '0.00',
  `cess` decimal(18,2) DEFAULT '0.00',
  `invoice_value` decimal(18,2) DEFAULT '0.00',
  `sales_ledger` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `alternate_unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoice_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_invoice_id` (`invoice_id`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_sales_items_foreign`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_sales_items_foreign`;
CREATE TABLE `voucher_sales_items_foreign` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `quantity` decimal(18,4) DEFAULT '0.0000',
  `uqc` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rate` decimal(18,2) DEFAULT '0.00',
  `amount` decimal(18,2) DEFAULT '0.00',
  `alternate_unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sales_ledger` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoice_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_invoice_id` (`invoice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `voucher_sales_paymentdetails`
--


/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
DROP TABLE IF EXISTS `voucher_sales_paymentdetails`;
CREATE TABLE `voucher_sales_paymentdetails` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `payment_taxable_value` decimal(18,2) DEFAULT '0.00',
  `payment_igst` decimal(18,2) DEFAULT '0.00',
  `payment_cgst` decimal(18,2) DEFAULT '0.00',
  `payment_sgst` decimal(18,2) DEFAULT '0.00',
  `payment_cess` decimal(18,2) DEFAULT '0.00',
  `payment_state_cess` decimal(18,2) DEFAULT '0.00',
  `payment_invoice_value` decimal(18,2) DEFAULT '0.00',
  `payment_tds_income_tax` decimal(18,2) DEFAULT '0.00',
  `payment_tds_gst` decimal(18,2) DEFAULT '0.00',
  `payment_advance` decimal(18,2) DEFAULT '0.00',
  `payment_payable` decimal(18,2) DEFAULT '0.00',
  `posting_note` longtext COLLATE utf8mb4_unicode_ci,
  `terms_conditions` longtext COLLATE utf8mb4_unicode_ci,
  `advance_references` longtext COLLATE utf8mb4_unicode_ci COMMENT 'JSON array of advance references',
  `invoice_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_invoice_id` (`invoice_id`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

