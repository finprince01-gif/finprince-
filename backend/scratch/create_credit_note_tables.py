import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

def create_tables():
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME"),
            port=os.getenv("DB_PORT", 3306)
        )
        cursor = conn.cursor()
        
        sql = """
        -- 1. Credit Note Invoice Details (Header)
        CREATE TABLE IF NOT EXISTS `voucher_credit_note_invoice_details` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `tenant_id` VARCHAR(36) NOT NULL,
            `date` DATE NOT NULL,
            `credit_note_series` VARCHAR(100) NULL,
            `credit_note_no` VARCHAR(100) NULL,
            `customer_name` VARCHAR(255) NOT NULL,
            `customer_id` BIGINT NULL,
            `branch` VARCHAR(255) NULL,
            `gstin` VARCHAR(15) NULL,
            `sales_invoice_nos` TEXT NULL,
            `sales_invoice_dates` TEXT NULL,
            `customer_debit_note_no` VARCHAR(100) NULL,
            `customer_debit_note_date` DATE NULL,
            `grn_ref_no` VARCHAR(100) NULL,
            `bill_from` TEXT NULL,
            `ship_from` TEXT NULL,
            `is_financial` VARCHAR(10) DEFAULT 'No',
            `in_foreign_currency` VARCHAR(10) DEFAULT 'No',
            `exchange_rate` DECIMAL(15, 6) DEFAULT 1.000000,
            `narration` TEXT NULL,
            `supporting_document` VARCHAR(255) NULL,
            `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX (`tenant_id`),
            INDEX (`date`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        -- 2. Credit Note Item Details
        CREATE TABLE IF NOT EXISTS `voucher_credit_note_item_details` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `tenant_id` VARCHAR(36) NOT NULL,
            `credit_note_details_id` BIGINT NOT NULL UNIQUE,
            `items` JSON NOT NULL,
            `total_taxable_value` DECIMAL(15, 2) DEFAULT 0.00,
            `total_igst` DECIMAL(15, 2) DEFAULT 0.00,
            `total_cgst` DECIMAL(15, 2) DEFAULT 0.00,
            `total_sgst` DECIMAL(15, 2) DEFAULT 0.00,
            `total_cess` DECIMAL(15, 2) DEFAULT 0.00,
            `total_invoice_value` DECIMAL(15, 2) DEFAULT 0.00,
            `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX (`tenant_id`),
            CONSTRAINT `fk_cn_invoice_items` FOREIGN KEY (`credit_note_details_id`) 
            REFERENCES `voucher_credit_note_invoice_details` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        -- 3. Credit Note Due Details
        CREATE TABLE IF NOT EXISTS `voucher_credit_note_due_details` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `tenant_id` VARCHAR(36) NOT NULL,
            `credit_note_details_id` BIGINT NOT NULL UNIQUE,
            `credit_period` INT DEFAULT 0,
            `due_date` DATE NULL,
            `tds_it` DECIMAL(15, 2) DEFAULT 0.00,
            `posting_note` TEXT NULL,
            `terms_conditions` TEXT NULL,
            `reverse_gst_tcs` VARCHAR(10) DEFAULT 'No',
            `reverse_gst_tds` VARCHAR(10) DEFAULT 'No',
            `gst_tds_tcs_amount` DECIMAL(15, 2) DEFAULT 0.00,
            `reverse_income_tax_tcs` VARCHAR(10) DEFAULT 'No',
            `reverse_income_tax_tds` VARCHAR(10) DEFAULT 'No',
            `income_tax_tds_tcs_amount` DECIMAL(15, 2) DEFAULT 0.00,
            `applied_invoices` JSON NOT NULL,
            `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX (`tenant_id`),
            CONSTRAINT `fk_cn_invoice_due` FOREIGN KEY (`credit_note_details_id`) 
            REFERENCES `voucher_credit_note_invoice_details` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        -- 4. Credit Note Transit Details
        CREATE TABLE IF NOT EXISTS `voucher_credit_note_transit_details` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `tenant_id` VARCHAR(36) NOT NULL,
            `credit_note_details_id` BIGINT NOT NULL UNIQUE,
            `received_in` VARCHAR(255) NULL,
            `mode_of_transport` VARCHAR(50) DEFAULT 'Road',
            `receipt_date` DATE NULL,
            `receipt_time` TIME(6) NULL,
            `delivery_type` VARCHAR(100) NULL,
            `transporter_id_gstin` VARCHAR(15) NULL,
            `transporter_name` VARCHAR(255) NULL,
            `vehicle_no` VARCHAR(50) NULL,
            `lr_gr_consignment_no` VARCHAR(100) NULL,
            `shipping_details` JSON NOT NULL,
            `created_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX (`tenant_id`),
            CONSTRAINT `fk_cn_invoice_transit` FOREIGN KEY (`credit_note_details_id`) 
            REFERENCES `voucher_credit_note_invoice_details` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        
        # Split by semicolon and run each statement
        for statement in sql.split(';'):
            if statement.strip():
                cursor.execute(statement)
        
        conn.commit()
        print("Credit Note tables created successfully!")
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    create_tables()
