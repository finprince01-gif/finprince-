from django.core.management.base import BaseCommand
from django.db import connection

class Command(BaseCommand):
    help = 'Manually patches DB schema for missing SalesVoucher columns'

    def handle(self, *args, **kwargs):
        self.stdout.write("Patching database schema...")
        with connection.cursor() as cursor:
            table = 'sales_vouchers'
            columns = [
                # Previous
                ('place_of_supply', 'VARCHAR(2) NULL'),
                ('tax_type', 'VARCHAR(20) NULL'),
                ('total_taxable_amount', 'DECIMAL(15,2) DEFAULT 0'),
                ('total_cgst', 'DECIMAL(15,2) DEFAULT 0'),
                ('total_sgst', 'DECIMAL(15,2) DEFAULT 0'),
                ('total_igst', 'DECIMAL(15,2) DEFAULT 0'),
                ('grand_total', 'DECIMAL(15,2) DEFAULT 0'),
                ('bill_to_gstin', 'VARCHAR(15) NULL'),
                ('bill_to_state', 'VARCHAR(100) NULL'),
                ('bill_to_address', 'TEXT NULL'),
                ('reverse_charge', 'VARCHAR(1) DEFAULT "N"'),
                ('invoice_type', 'VARCHAR(50) DEFAULT "Regular"'),
                ('export_type', 'VARCHAR(10) NULL'),
                ('ecommerce_gstin', 'VARCHAR(15) NULL'),
                ('port_code', 'VARCHAR(6) NULL'),
                ('shipping_bill_number', 'VARCHAR(50) NULL'),
                ('shipping_bill_date', 'DATE NULL'),
                ('current_step', 'INT DEFAULT 1'),
                ('payment_details', 'JSON NULL'),
                ('dispatch_details', 'JSON NULL'),
                ('einvoice_details', 'JSON NULL'),
                # New from Voucher Entry UI
                ('voucher_name', 'VARCHAR(100) NULL'),
                ('outward_slip_no', 'VARCHAR(50) NULL'),
            ]
            
            for col, dtype in columns:
                try:
                    cursor.execute(f"SHOW COLUMNS FROM {table} LIKE '{col}'")
                    result = cursor.fetchone()
                    
                    if not result:
                        sql = f"ALTER TABLE {table} ADD COLUMN {col} {dtype}"
                        self.stdout.write(f"Executing: {sql}")
                        cursor.execute(sql)
                        self.stdout.write(self.style.SUCCESS(f"Added {col}"))
                    else:
                         self.stdout.write(f"Column {col} already exists.")
                         
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Error handling {col}: {e}"))
