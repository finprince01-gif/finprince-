from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

sql = """
CREATE TABLE IF NOT EXISTS entries (
  id bigint NOT NULL AUTO_INCREMENT,
  tenant_id varchar(36) NOT NULL,
  created_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  voucher_id bigint NOT NULL,
  ledger_id bigint NOT NULL,
  date date NOT NULL,
  debit decimal(15,2) NOT NULL DEFAULT '0.00',
  credit decimal(15,2) NOT NULL DEFAULT '0.00',
  narration longtext,
  PRIMARY KEY (id),
  KEY entries_tenant_id_idx (tenant_id),
  KEY entries_voucher_id_idx (voucher_id),
  KEY entries_ledger_id_idx (ledger_id),
  CONSTRAINT entries_ledger_fk FOREIGN KEY (ledger_id) REFERENCES master_ledgers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""
# Note: removed foreign key to vouchers for now as it might cause issues if vouchers table has different structure or constraints. 
# But wait, vouchers table exists. I'll add it back.

sql_with_fks = """
CREATE TABLE IF NOT EXISTS entries (
  id bigint NOT NULL AUTO_INCREMENT,
  tenant_id varchar(36) NOT NULL,
  created_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  voucher_id bigint NOT NULL,
  ledger_id bigint NOT NULL,
  date date NOT NULL,
  debit decimal(15,2) NOT NULL DEFAULT '0.00',
  credit decimal(15,2) NOT NULL DEFAULT '0.00',
  narration longtext,
  PRIMARY KEY (id),
  KEY entries_tenant_id_idx (tenant_id),
  KEY entries_voucher_id_idx (voucher_id),
  KEY entries_ledger_id_idx (ledger_id),
  CONSTRAINT entries_vouchers_fk FOREIGN KEY (voucher_id) REFERENCES vouchers (id) ON DELETE CASCADE,
  CONSTRAINT entries_ledger_fk FOREIGN KEY (ledger_id) REFERENCES master_ledgers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

with connection.cursor() as cursor:
    try:
        cursor.execute(sql_with_fks)
        print("Table 'entries' created successfully.")
    except Exception as e:
        print(f"Error creating table 'entries': {e}")
