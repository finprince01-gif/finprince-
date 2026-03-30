from django.core.management.base import BaseCommand
from django.db import connection

class Command(BaseCommand):
    help = 'Force create Payment Voucher tables in the database'

    def handle(self, *args, **kwargs):
        self.stdout.write("Force creating Payment Voucher tables...")
        with connection.cursor() as cursor:
            # 1. payment_vouchers
            self.stdout.write("Creating payment_vouchers table...")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS payment_vouchers (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    tenant_id VARCHAR(36) NOT NULL,
                    created_at DATETIME(6) NULL,
                    updated_at DATETIME(6) NULL,
                    date DATE NOT NULL,
                    voucher_number VARCHAR(100) NOT NULL,
                    pay_from_id BIGINT NULL,
                    voucher_type VARCHAR(100) NULL,
                    source VARCHAR(100) NOT NULL DEFAULT 'manual',
                    narration TEXT NULL,
                    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    bank_reconciled BOOLEAN NOT NULL DEFAULT 0,
                    bank_reconcile_date DATE NULL,
                    bank_statement_id BIGINT NULL,
                    bank_reference_number VARCHAR(100) NULL,
                    INDEX idx_payment_vouchers_tenant_date (tenant_id, date),
                    INDEX idx_payment_vouchers_vnum (voucher_number)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """)
            self.stdout.write(self.style.SUCCESS("Table 'payment_vouchers' created/ensured."))

            # 2. payment_voucher_items
            self.stdout.write("Creating payment_voucher_items table...")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS payment_voucher_items (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    voucher_id BIGINT NOT NULL,
                    pay_to_ledger_id BIGINT NOT NULL,
                    amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    reference_type VARCHAR(20) NOT NULL DEFAULT 'INVOICE',
                    reference_id BIGINT NULL,
                    transaction_details JSON NULL,
                    created_at DATETIME(6) NULL,
                    updated_at DATETIME(6) NULL,
                    INDEX idx_pv_items_voucher (voucher_id),
                    INDEX idx_pv_items_ledger (pay_to_ledger_id),
                    FOREIGN KEY (voucher_id) REFERENCES payment_vouchers(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """)
            self.stdout.write(self.style.SUCCESS("Table 'payment_voucher_items' created/ensured."))
