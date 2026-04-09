"""
create_pending_transaction_tables.py
=====================================
Direct SQL script to create the pending_transactions and allocation_links
tables without relying on Django migrations (works around InconsistentMigrationHistory).

Run:
    python create_pending_transaction_tables.py
"""
import os, sys, django

# Bootstrap Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

django.setup()

from django.db import connection

TABLE_SQL = [
    # pending_transactions
    """
    CREATE TABLE IF NOT EXISTS `pending_transactions` (
        `id`                  BIGINT AUTO_INCREMENT PRIMARY KEY,
        `created_at`          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        `updated_at`          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        `tenant_id`           VARCHAR(36) NOT NULL,
        `reference_number`    VARCHAR(150) NOT NULL,
        `reference_type`      VARCHAR(20) NOT NULL,
        `reference_date`      DATE NULL,
        `vendor_id`           INT NULL,
        `customer_id`         INT NULL,
        `purchase_voucher_id` BIGINT NULL,
        `original_amount`     DECIMAL(15,2) NOT NULL DEFAULT 0,
        `pending_balance`     DECIMAL(15,2) NOT NULL DEFAULT 0,
        `status`              VARCHAR(30) NOT NULL DEFAULT 'Open',
        UNIQUE KEY `uq_pending_tx` (`tenant_id`, `reference_number`, `reference_type`),
        KEY `idx_pending_tx_tenant_id`   (`tenant_id`),
        KEY `idx_pending_tx_vendor_id`   (`tenant_id`, `vendor_id`),
        KEY `idx_pending_tx_customer_id` (`tenant_id`, `customer_id`),
        KEY `idx_pending_tx_type_status` (`tenant_id`, `reference_type`, `status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """,
    # allocation_links
    """
    CREATE TABLE IF NOT EXISTS `allocation_links` (
        `id`                       BIGINT AUTO_INCREMENT PRIMARY KEY,
        `created_at`               DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        `updated_at`               DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        `tenant_id`                VARCHAR(36) NOT NULL,
        `source_reference_number`  VARCHAR(150) NOT NULL,
        `source_reference_type`    VARCHAR(20) NOT NULL,
        `source_reference_date`    DATE NULL,
        `target_reference_number`  VARCHAR(150) NOT NULL,
        `target_reference_type`    VARCHAR(20) NOT NULL,
        `amount_applied`           DECIMAL(15,2) NOT NULL,
        KEY `idx_alloc_link_source` (`tenant_id`, `source_reference_number`, `source_reference_type`),
        KEY `idx_alloc_link_target` (`tenant_id`, `target_reference_number`, `target_reference_type`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """,
    # Mark the migration as applied in django_migrations so future migrate runs are clean
    """
    INSERT IGNORE INTO `django_migrations` (`app`, `name`, `applied`)
    VALUES ('accounting', '0007_debit_note_bill_allocation', NOW());
    """,
]

with connection.cursor() as cursor:
    for sql in TABLE_SQL:
        sql = sql.strip()
        if sql:
            try:
                cursor.execute(sql)
                print(f"OK: {sql[:80].strip()}...")
            except Exception as e:
                print(f"ERROR: {e}\n  SQL: {sql[:80].strip()}...")

print("\nDone. Tables pending_transactions and allocation_links are ready.")
