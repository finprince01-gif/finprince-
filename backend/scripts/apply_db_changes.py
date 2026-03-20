import mysql.connector

def run_step_1_to_5():
    try:
        conn = mysql.connector.connect(
            user='root', 
            password='Ulaganathan123', 
            database='Finpixe_AI_Accounting', 
            host='localhost', 
            port=3306,
            autocommit=True
        )
        cursor = conn.cursor()
        
        # Mapping based on DB audit
        mapping = {
            'customer': 'customer_master',
            'outward_slip': 'inventory_operation_outward',
            'sales_voucher': 'voucher_sales_invoicedetails'
        }
        
        print("=== STEP 1: INSPECT EXISTING STRUCTURE ===")
        for short, real in mapping.items():
            print(f"\nInspecting {short} ({real}):")
            try:
                cursor.execute(f"DESCRIBE `{real}`")
                cols = cursor.fetchall()
                for c in cols:
                    print(c)
            except Exception as e:
                print(f"Error inspecting {real}: {e}")

        print("\n=== STEP 2: ADD MISSING COLUMNS (SAFE) ===")
        # outward_slip -> customer_id
        try:
            # Check if customer_id exists in outward_slip
            cursor.execute(f"SHOW COLUMNS FROM `{mapping['outward_slip']}` LIKE 'customer_id'")
            if not cursor.fetchone():
                print(f"Adding customer_id to {mapping['outward_slip']}...")
                cursor.execute(f"ALTER TABLE `{mapping['outward_slip']}` ADD COLUMN customer_id BIGINT NULL")
            else:
                print(f"customer_id already exists in {mapping['outward_slip']}")
        except Exception as e:
            print(f"Error in Step 2: {e}")

        # sales_voucher -> outward_slip_id
        try:
            cursor.execute(f"SHOW COLUMNS FROM `{mapping['sales_voucher']}` LIKE 'outward_slip_id'")
            if not cursor.fetchone():
                print(f"Adding outward_slip_id to {mapping['sales_voucher']}...")
                cursor.execute(f"ALTER TABLE `{mapping['sales_voucher']}` ADD COLUMN outward_slip_id BIGINT NULL")
            else:
                print(f"outward_slip_id already exists in {mapping['sales_voucher']}")
        except Exception as e:
            print(f"Error in Step 2: {e}")

        print("\n=== STEP 3: ADD USAGE TRACKING (NON-BREAKING) ===")
        # outward_slip -> status, linked_sales_voucher_id
        try:
            cursor.execute(f"SHOW COLUMNS FROM `{mapping['outward_slip']}` LIKE 'status'")
            if not cursor.fetchone():
                print(f"Adding status to {mapping['outward_slip']}...")
                cursor.execute(f"ALTER TABLE `{mapping['outward_slip']}` ADD COLUMN status VARCHAR(20) DEFAULT 'PENDING'")
            else:
                print(f"status already exists in {mapping['outward_slip']}")

            cursor.execute(f"SHOW COLUMNS FROM `{mapping['outward_slip']}` LIKE 'linked_sales_voucher_id'")
            if not cursor.fetchone():
                print(f"Adding linked_sales_voucher_id to {mapping['outward_slip']}...")
                cursor.execute(f"ALTER TABLE `{mapping['outward_slip']}` ADD COLUMN linked_sales_voucher_id BIGINT NULL")
            else:
                print(f"linked_sales_voucher_id already exists in {mapping['outward_slip']}")
        except Exception as e:
            print(f"Error in Step 3: {e}")

        print("\n=== STEP 4: ADD FOREIGN KEY CONSTRAINTS ===")
        constraints = [
            ("fk_outward_customer", mapping['outward_slip'], "customer_id", mapping['customer'], "id"),
            ("fk_sales_customer", mapping['sales_voucher'], "customer_id", mapping['customer'], "id"),
            ("fk_sales_outward", mapping['sales_voucher'], "outward_slip_id", mapping['outward_slip'], "id"),
            ("fk_outward_sales", mapping['outward_slip'], "linked_sales_voucher_id", mapping['sales_voucher'], "id")
        ]
        
        for name, table, col, ref_table, ref_col in constraints:
            try:
                # Check if exists
                cursor.execute(f"SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = 'Finpixe_AI_Accounting' AND TABLE_NAME = '{table}' AND CONSTRAINT_NAME = '{name}'")
                if not cursor.fetchone():
                    print(f"Adding constraint {name} to {table}...")
                    cursor.execute(f"ALTER TABLE `{table}` ADD CONSTRAINT `{name}` FOREIGN KEY (`{col}`) REFERENCES `{ref_table}` (`{ref_col}`)")
                else:
                    print(f"Constraint {name} already exists.")
            except Exception as e:
                print(f"Error adding constraint {name}: {e}")

        print("\n=== STEP 5: ENFORCE SINGLE USAGE (CRITICAL) ===")
        try:
            # Check if unique index exists
            cursor.execute(f"SHOW INDEX FROM `{mapping['outward_slip']}` WHERE Key_name = 'linked_sales_voucher_id'")
            if not cursor.fetchone():
                print(f"Adding unique constraint on linked_sales_voucher_id in {mapping['outward_slip']}...")
                # It might already have an index but not unique. Let's make it unique.
                cursor.execute(f"ALTER TABLE `{mapping['outward_slip']}` ADD UNIQUE (`linked_sales_voucher_id`)")
            else:
                print(f"Unique constraint on linked_sales_voucher_id already exists in {mapping['outward_slip']}")
        except Exception as e:
            print(f"Error in Step 5: {e}")

        conn.close()
    except Exception as e:
        print(f"Global connection error: {e}")

if __name__ == "__main__":
    run_step_1_to_5()
