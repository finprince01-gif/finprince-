
import os
import django
import random
import uuid
from datetime import date, timedelta
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def seed_all():
    print("Starting Comprehensive Seeding...")
    with connection.cursor() as cursor:
        # 1. Get Tenant
        tenant_id = None
        cursor.execute("SELECT id FROM tenants LIMIT 1")
        row = cursor.fetchone()
        if row:
            tenant_id = row[0]
        else:
            # Fallback
            cursor.execute("SELECT tenant_id FROM users LIMIT 1")
            row = cursor.fetchone()
            if row:
                tenant_id = row[0]
        
        if not tenant_id:
            print("No tenant ID found. Creating dummy tenant...")
            tenant_id = str(uuid.uuid4())
            cursor.execute(f"INSERT INTO tenants (id, name, created_at, updated_at) VALUES ('{tenant_id}', 'Seed Tenant', NOW(), NOW())")

        print(f"Using Tenant ID: {tenant_id}")

        # --- HELPERS ---
        def get_or_create_vendor():
            cursor.execute(f"SELECT id, vendor_name FROM vendor_master_basicdetail WHERE tenant_id='{tenant_id}' LIMIT 1")
            row = cursor.fetchone()
            if row:
                return row
            
            # Create
            v_code = f"VEND-{random.randint(1000,9999)}"
            name = f"Seed Vendor {random.randint(1,100)}"



            sql = f"""
                INSERT INTO vendor_master_basicdetail 
                (tenant_id, vendor_code, vendor_name, is_also_customer, is_active, pan_no, email, contact_no, created_at, updated_at)
                VALUES ('{tenant_id}', '{v_code}', '{name}', 0, 1, 'ABCDE1234F', 'vendor@example.com', '1234567890', NOW(), NOW())
            """
            cursor.execute(sql)
            return (cursor.lastrowid, name)

        def get_or_create_customer():
            cursor.execute(f"SELECT id, customer_name FROM customer_master_customer_basicdetails WHERE tenant_id='{tenant_id}' LIMIT 1")
            row = cursor.fetchone()
            if row:
                return row
            
            # Create
            c_code = f"CUST-{random.randint(1000,9999)}"
            name = f"Seed Customer {random.randint(1,100)}"
            sql = f"""
                INSERT INTO customer_master_customer_basicdetails 
                (tenant_id, customer_code, customer_name, is_active, created_at, updated_at)
                VALUES ('{tenant_id}', '{c_code}', '{name}', 1, NOW(), NOW())
            """
            cursor.execute(sql)
            # Need to fetch ID specially if not auto-returning (depends on driver)
            cursor.execute("SELECT LAST_INSERT_ID()")
            return (cursor.fetchone()[0], name)

        # --- SEED VENDORS & POs ---
        print("Seeding Vendors & POs...")
        for _ in range(3):
            vid, vname = get_or_create_vendor()
            po_num = f"PO-{random.randint(10000,99999)}"
            # Verify uniqueness
            cursor.execute(f"SELECT id FROM vendor_transaction_po WHERE po_number='{po_num}'")
            if not cursor.fetchone():
                val = random.randint(1000, 50000)
                sql = f"""
                    INSERT INTO vendor_transaction_po
                    (tenant_id, po_number, vendor_basic_detail_id, vendor_name, total_value, status, created_at, updated_at)
                    VALUES
                    ('{tenant_id}', '{po_num}', {vid}, '{vname}', {val}, 'Approved', NOW(), NOW())
                """
                cursor.execute(sql)

        # --- SEED SALES ORDERS ---
        print("Seeding Sales Orders...")
        for _ in range(3):
            cid, cname = get_or_create_customer()
            so_num = f"SO-{random.randint(10000,99999)}"
            cursor.execute(f"SELECT id FROM customer_transaction_salesorder_basicdetails WHERE so_number='{so_num}'")
            if not cursor.fetchone():
                sql = f"""
                    INSERT INTO customer_transaction_salesorder_basicdetails
                    (tenant_id, so_number, customer_name, date, is_active, created_at, updated_at)
                    VALUES
                    ('{tenant_id}', '{so_num}', '{cname}', '{date.today()}', 1, NOW(), NOW())
                """
                cursor.execute(sql)

        # --- SEED EMPLOYEES ---
        print("Seeding Employees...")
        titles = ['Manager', 'Developer', 'Accountant', 'HR']
        for i in range(5):
            code = f"EMP{random.randint(100,999)}"
            email = f"emp{i}_{random.randint(100,999)}@example.com"
            cursor.execute(f"SELECT id FROM payroll_employee WHERE employee_code='{code}'")
            if not cursor.fetchone():
                name = f"Employee {i}"
                sql = f"""
                    INSERT INTO payroll_employee
                    (tenant_id, employee_code, employee_name, email, employment_type, basic_salary, hra, status, created_at, updated_at)
                    VALUES
                    ('{tenant_id}', '{code}', '{name}', '{email}', 'Full Time', 50000, 20000, 'Active', NOW(), NOW())
                """
                cursor.execute(sql)


        # --- SEED VOUCHERS ---
        print("Seeding Accounting Vouchers...")
        # Check if master_ledgers exists for linking, else use strings
        types = ['Payment', 'Receipt', 'Contra', 'Journal']
        for _ in range(10):
            v_id = f"VCH-{random.randint(10000,99999)}"
            v_type = random.choice(types)
            amount = random.randint(100, 10000)
            
            cursor.execute(f"SELECT id FROM accounting_voucher WHERE id='{v_id}'")
            if not cursor.fetchone():
                sql = f"""
                    INSERT INTO accounting_voucher
                    (id, tenant_id, date, type, amount, total, total_taxable_amount, total_cgst, total_sgst, total_igst, total_debit, total_credit, is_inter_state)
                    VALUES
                    ('{v_id}', '{tenant_id}', '{date.today()}', '{v_type}', {amount}, {amount}, {amount}, 0, 0, 0, {amount}, {amount}, 0)
                """
                try:
                    cursor.execute(sql)
                except Exception as e:
                    print(f"ERROR in Vouchers: {e}")
                    print(f"SQL: {sql}")

        connection.commit()
    print("Comprehensive Seeding Complete.")

if __name__ == '__main__':
    seed_all()
