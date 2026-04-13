"""
Migration 0024 — Payment & Receipt Table Refactor
===================================================
Goal:
  1. Add all missing columns to `advance_allocations` so it matches
     the new AdvanceAllocation model (models_advance_allocation.py).
  2. Add all missing columns to `pending_transactions` so it matches
     the new PendingTransaction model (models_pending_transaction.py).
  3. Drop old redundant tables:
       payment_vouchers, receipt_vouchers,
       payment_voucher_items, receipt_voucher_items,
       voucher_allocations, voucher_pending_transactions,
       allocation_links

NOTE: We use RunSQL for the ALTER TABLE operations because the existing
Django ORM model-state for these tables is out of sync with the real DB.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0023_remove_receiptallocationdetail_receipt_item_and_more'),
    ]

    operations = [        # ====================================================================
        # 1. ADVANCE_ALLOCATIONS — add missing columns
        # ====================================================================
        migrations.RunSQL(
            sql="""
            ALTER TABLE advance_allocations
                ADD COLUMN type                VARCHAR(20)     NOT NULL DEFAULT 'payment_single',
                ADD COLUMN voucher_number      VARCHAR(100)    NULL     DEFAULT NULL,
                ADD COLUMN voucher_date        DATE            NULL     DEFAULT NULL,
                ADD COLUMN narration           LONGTEXT        NULL     DEFAULT NULL,
                ADD COLUMN pay_from_ledger_id  BIGINT          NULL     DEFAULT NULL,
                ADD COLUMN pay_from_ledger_name VARCHAR(255)   NULL     DEFAULT NULL,
                ADD COLUMN pay_to_ledger_id    BIGINT          NULL     DEFAULT NULL,
                ADD COLUMN pay_to_ledger_name  VARCHAR(255)   NULL     DEFAULT NULL,
                ADD COLUMN vendor_name         VARCHAR(255)    NULL     DEFAULT NULL,
                ADD COLUMN customer_name       VARCHAR(255)    NULL     DEFAULT NULL,
                ADD COLUMN advance_amount      DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
                ADD COLUMN total_amount        DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
                ADD COLUMN bank_reconciled     TINYINT(1)      NOT NULL DEFAULT 0,
                ADD COLUMN bank_reconcile_date DATE            NULL     DEFAULT NULL,
                ADD COLUMN bank_statement_id   BIGINT          NULL     DEFAULT NULL,
                ADD COLUMN bank_reference_number VARCHAR(100)  NULL     DEFAULT NULL,
                ADD COLUMN source              VARCHAR(100)    NOT NULL DEFAULT 'manual';
            """,
            reverse_sql="""
            ALTER TABLE advance_allocations
                DROP COLUMN type,
                DROP COLUMN voucher_number,
                DROP COLUMN voucher_date,
                DROP COLUMN narration,
                DROP COLUMN pay_from_ledger_id,
                DROP COLUMN pay_from_ledger_name,
                DROP COLUMN pay_to_ledger_id,
                DROP COLUMN pay_to_ledger_name,
                DROP COLUMN vendor_name,
                DROP COLUMN customer_name,
                DROP COLUMN advance_amount,
                DROP COLUMN total_amount,
                DROP COLUMN bank_reconciled,
                DROP COLUMN bank_reconcile_date,
                DROP COLUMN bank_statement_id,
                DROP COLUMN bank_reference_number,
                DROP COLUMN source;
            """,
        ),

        # Add indexes on new columns
        migrations.RunSQL(
            sql="""
            CREATE INDEX adv_alloc_type_idx      ON advance_allocations (tenant_id, type);
            CREATE INDEX adv_alloc_pay_from_idx  ON advance_allocations (pay_from_ledger_id);
            CREATE INDEX adv_alloc_pay_to_idx    ON advance_allocations (pay_to_ledger_id);
            """,
            reverse_sql="""
            DROP INDEX adv_alloc_type_idx      ON advance_allocations;
            DROP INDEX adv_alloc_pay_from_idx  ON advance_allocations;
            DROP INDEX adv_alloc_pay_to_idx    ON advance_allocations;
            """,
        ),

        # ====================================================================
        # 2. PENDING_TRANSACTIONS — add missing columns and rename
        # ====================================================================
        migrations.RunSQL(
            sql="""
            ALTER TABLE pending_transactions
                ADD COLUMN type                VARCHAR(20)     NOT NULL DEFAULT 'payment_single',
                ADD COLUMN voucher_number      VARCHAR(100)    NULL     DEFAULT NULL,
                ADD COLUMN voucher_date        DATE            NULL     DEFAULT NULL,
                ADD COLUMN voucher_type        VARCHAR(100)    NULL     DEFAULT NULL,
                ADD COLUMN pay_from_ledger_id  BIGINT          NULL     DEFAULT NULL,
                ADD COLUMN pay_from_ledger_name VARCHAR(255)   NULL     DEFAULT NULL,
                ADD COLUMN pay_to_ledger_id    BIGINT          NULL     DEFAULT NULL,
                ADD COLUMN pay_to_ledger_name  VARCHAR(255)   NULL     DEFAULT NULL,
                ADD COLUMN vendor_name         VARCHAR(255)    NULL     DEFAULT NULL,
                ADD COLUMN customer_name       VARCHAR(255)    NULL     DEFAULT NULL,
                ADD COLUMN amount_applied      DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
                ADD COLUMN balance_after       DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
                ADD COLUMN due_date            DATE            NULL     DEFAULT NULL,
                ADD COLUMN days_to_due         INT             NULL     DEFAULT NULL,
                ADD COLUMN narration           LONGTEXT        NULL     DEFAULT NULL;

            ALTER TABLE pending_transactions
                CHANGE COLUMN reference_date  invoice_date DATE NULL DEFAULT NULL,
                CHANGE COLUMN pending_balance pending_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00;
            """,
            reverse_sql="""
            ALTER TABLE pending_transactions
                CHANGE COLUMN invoice_date    reference_date DATE NULL DEFAULT NULL,
                CHANGE COLUMN pending_amount  pending_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00;

            ALTER TABLE pending_transactions
                DROP COLUMN type,
                DROP COLUMN voucher_number,
                DROP COLUMN voucher_date,
                DROP COLUMN voucher_type,
                DROP COLUMN pay_from_ledger_id,
                DROP COLUMN pay_from_ledger_name,
                DROP COLUMN pay_to_ledger_id,
                DROP COLUMN pay_to_ledger_name,
                DROP COLUMN vendor_name,
                DROP COLUMN customer_name,
                DROP COLUMN amount_applied,
                DROP COLUMN balance_after,
                DROP COLUMN due_date,
                DROP COLUMN days_to_due,
                DROP COLUMN narration;
            """,
        ),

        # Add indexes
        migrations.RunSQL(
            sql="""
            CREATE INDEX pt_tenant_type_idx ON pending_transactions (tenant_id, type);
            CREATE INDEX pt_voucher_idx     ON pending_transactions (tenant_id, voucher_number);
            CREATE INDEX pt_payfrom_idx     ON pending_transactions (pay_from_ledger_id);
            CREATE INDEX pt_payto_idx       ON pending_transactions (pay_to_ledger_id);
            """,
            reverse_sql="""
            DROP INDEX pt_tenant_type_idx ON pending_transactions;
            DROP INDEX pt_voucher_idx     ON pending_transactions;
            DROP INDEX pt_payfrom_idx     ON pending_transactions;
            DROP INDEX pt_payto_idx       ON pending_transactions;
            """,
        ),

        # ====================================================================
        # 3. DROP OLD REDUNDANT TABLES
        # ====================================================================
        migrations.RunSQL(
            sql="""
            SET FOREIGN_KEY_CHECKS = 0;

            DROP TABLE IF EXISTS payment_voucher_items;
            DROP TABLE IF EXISTS receipt_voucher_items;
            DROP TABLE IF EXISTS voucher_allocations;
            DROP TABLE IF EXISTS voucher_pending_transactions;
            DROP TABLE IF EXISTS allocation_links;
            DROP TABLE IF EXISTS payment_vouchers;
            DROP TABLE IF EXISTS receipt_vouchers;

            SET FOREIGN_KEY_CHECKS = 1;
            """,
            reverse_sql="-- Cannot recreate dropped tables automatically; restore from backup if needed.",
        ),
    ]
