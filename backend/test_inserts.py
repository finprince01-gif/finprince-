
import os
import django
import random
from datetime import date
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def test_inserts():
    print("Testing Inserts...", flush=True)
    with connection.cursor() as cursor:
        tenant_id = 'test-tenant'
        
        # 1. Vendor
        try:
            print("Trying Vendor...", flush=True)
            cursor.execute(f"INSERT INTO vendor_master_basicdetail (tenant_id, vendor_code, vendor_name, status, is_active, created_at, updated_at) VALUES ('{tenant_id}', 'V-TEST', 'Test Vendor', 'Active', 1, NOW(), NOW())")
            print("Vendor OK", flush=True)
        except Exception as e:
            print(f"Vendor Failed: {e}", flush=True)

        # 2. PO
        try:
            print("Trying PO...", flush=True)
            # Need ID from previous step if we want FK success, but we just want to test column existence so FK fail is fine (OperationalError vs IntegrityError)
            cursor.execute(f"INSERT INTO vendor_transaction_po (tenant_id, po_number, vendor_name, total_value, status, created_at, updated_at) VALUES ('{tenant_id}', 'PO-TEST', 'Test Vendor', 100, 'Draft', NOW(), NOW())")
            print("PO OK", flush=True)
        except Exception as e:
            print(f"PO Failed: {e}", flush=True)

        # 3. SO
        try:
            print("Trying SO...", flush=True)
            cursor.execute(f"INSERT INTO customer_transaction_salesorder_basicdetails (tenant_id, so_number, customer_name, date, is_active, created_at, updated_at) VALUES ('{tenant_id}', 'SO-TEST', 'Test Cust', '{date.today()}', 1, NOW(), NOW())")
            print("SO OK", flush=True)
        except Exception as e:
            print(f"SO Failed: {e}", flush=True)

        # 4. Employee
        try:
            print("Trying Employee...", flush=True)
            cursor.execute(f"INSERT INTO payroll_employee (tenant_id, employee_code, employee_name, email, employment_type, basic_salary, hra, status, created_at, updated_at) VALUES ('{tenant_id}', 'EMP-TEST', 'Test Emp', 'e@e.com', 'FT', 100, 10, 'Active', NOW(), NOW())")
            print("Employee OK", flush=True)
        except Exception as e:
            print(f"Employee Failed: {e}", flush=True)

        # 5. Voucher
        try:
            print("Trying Voucher...", flush=True)
            sql = f"""
                INSERT INTO accounting_voucher
                (id, tenant_id, date, type, amount, total, total_taxable_amount, total_cgst, total_sgst, total_igst, total_debit, total_credit, is_inter_state)
                VALUES
                ('VCH-TEST', '{tenant_id}', '{date.today()}', 'Journal', 100, 100, 100, 0, 0, 0, 100, 100, 0)
            """
            cursor.execute(sql)
            print("Voucher OK", flush=True)
        except Exception as e:
            print(f"Voucher Failed: {e}", flush=True)
    
        connection.rollback() # Don't save
    print("Test Complete.")

if __name__ == '__main__':
    test_inserts()
