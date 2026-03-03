-- Update Schema to include missing tables for AI Usage and Invoice Scanner
CREATE TABLE IF NOT EXISTS `ai_usage` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) NOT NULL,
  `year` int NOT NULL,
  `month` int NOT NULL,
  `used_count` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ai_usage_tenant_year_month_unique` (`tenant_id`,`year`,`month`),
  CONSTRAINT `ai_usage_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Create extraction_performance table if it doesn't exist
CREATE TABLE IF NOT EXISTS `extraction_performance` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `file_count` int NOT NULL DEFAULT '1',
  `processing_time_seconds` double NOT NULL,
  `timestamp` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Fix table mapping for Company Info if needed (Matches models.py)
CREATE TABLE IF NOT EXISTS `core_companyfullinfo` (
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
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `core_company_tenant_id_unique` (`tenant_id`),
  CONSTRAINT `core_companyinfo_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Ensure required columns for password reset are present
CREATE TABLE IF NOT EXISTS `password_reset_otps` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `otp_hash` varchar(255) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `attempts` int NOT NULL DEFAULT '0',
  `used` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `password_reset_otps_user_id_fk` (`user_id`),
  CONSTRAINT `password_reset_otps_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
