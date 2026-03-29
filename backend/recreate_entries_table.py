from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

sql = """
DROP TABLE IF EXISTS entries;
CREATE TABLE entries (
  id bigint NOT NULL AUTO_INCREMENT,
  tenant_id varchar(36) NOT NULL,
  created_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  voucher_type varchar(50) NOT NULL,
  voucher_id bigint NOT NULL,
  voucher_number varchar(50) DEFAULT NULL,
  transaction_date date DEFAULT NULL,
  narration longtext,
  ledger_id bigint DEFAULT NULL,
  ledger_name varchar(255) DEFAULT NULL,
  debit decimal(15,2) NOT NULL DEFAULT '0.00',
  credit decimal(15,2) NOT NULL DEFAULT '0.00',
  customer_id bigint DEFAULT NULL,
  vendor_id bigint DEFAULT NULL,
  PRIMARY KEY (id),
  KEY entries_tenant_id_idx (tenant_id),
  KEY entries_voucher_sync_idx (tenant_id, voucher_type, voucher_id),
  KEY entries_ledger_id_idx (ledger_id),
  CONSTRAINT entries_ledger_fk FOREIGN KEY (ledger_id) REFERENCES master_ledgers (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

with connection.cursor() as cursor:
    try:
        cursor.execute("DROP TABLE IF EXISTS entries;")
        cursor.execute("""
        CREATE TABLE entries (
          id bigint NOT NULL AUTO_INCREMENT,
          tenant_id varchar(36) NOT NULL,
          created_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
          updated_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          voucher_type varchar(50) NOT NULL,
          voucher_id bigint NOT NULL,
          voucher_number varchar(50) DEFAULT NULL,
          transaction_date date DEFAULT NULL,
          narration longtext,
          ledger_id bigint DEFAULT NULL,
          ledger_name varchar(255) DEFAULT NULL,
          debit decimal(15,2) NOT NULL DEFAULT '0.00',
          credit decimal(15,2) NOT NULL DEFAULT '0.00',
          customer_id bigint DEFAULT NULL,
          vendor_id bigint DEFAULT NULL,
          PRIMARY KEY (id),
          KEY entries_tenant_id_idx (tenant_id),
          KEY entries_voucher_sync_idx (tenant_id, voucher_type, voucher_id),
          KEY entries_ledger_id_idx (ledger_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)
        print("Table 'entries' recreated successfully.")
    except Exception as e:
        print(f"Error recreating table 'entries': {e}")
