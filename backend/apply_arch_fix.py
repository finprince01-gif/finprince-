from django.db import connection, transaction
import json

def apply_fixes():
    cursor = connection.cursor()
    
    steps_results = {}
    
    try:
        # Step 1: Composite Unique on Vendor Root
        print("Step 1: Adding Composite Unique Key to Vendor Root...")
        cursor.execute("""
            ALTER TABLE vendor_master_vendorcreation_basicdetail
            ADD CONSTRAINT vendor_tenant_id_unique
            UNIQUE (tenant_id, id);
        """)
        steps_results['step_1'] = "SUCCESS: Composite UNIQUE created on Vendor root (tenant_id, id)"
    except Exception as e:
        steps_results['step_1'] = f"ALREADY EXISTS or ERROR: {str(e)}"

    try:
        # Step 2: Add Column to Purchase Header
        print("Step 2: Adding Column to Purchase Header...")
        cursor.execute("""
            ALTER TABLE voucher_purchase_supplier_details
            ADD COLUMN vendor_basic_detail_id BIGINT;
        """)
        steps_results['step_2'] = "SUCCESS: vendor_basic_detail_id column added"
    except Exception as e:
        steps_results['step_2'] = f"ALREADY EXISTS or ERROR: {str(e)}"

    try:
        # Step 3: Add Composite Foreign Key
        print("Step 3: Adding Composite Foreign Key...")
        cursor.execute("""
            ALTER TABLE voucher_purchase_supplier_details
            ADD CONSTRAINT fk_purchase_vendor_multitenant
            FOREIGN KEY (tenant_id, vendor_basic_detail_id)
            REFERENCES vendor_master_vendorcreation_basicdetail(tenant_id, id)
            ON DELETE RESTRICT;
        """)
        steps_results['step_3'] = "SUCCESS: Composite FK created successfully"
    except Exception as e:
        steps_results['step_3'] = f"ERROR: {str(e)}"

    try:
        # Step 4: Data Migration
        print("Step 4: Migrating Data...")
        cursor.execute("""
            UPDATE voucher_purchase_supplier_details p
            JOIN vendor_master_vendorcreation_basicdetail v 
            ON p.vendor_name = v.vendor_name AND p.tenant_id = v.tenant_id
            SET p.vendor_basic_detail_id = v.id;
        """)
        steps_results['step_4'] = f"SUCCESS: Migrated {cursor.rowcount} records"
    except Exception as e:
        steps_results['step_4'] = f"ERROR: {str(e)}"

    try:
        # Step 5: Check Orphans
        print("Step 5: Validating No Orphan Records...")
        cursor.execute("SELECT count(*) FROM voucher_purchase_supplier_details WHERE vendor_basic_detail_id IS NULL;")
        orphans = cursor.fetchone()[0]
        steps_results['step_5'] = f"INFO: {orphans} orphan records remain"
        
        if orphans == 0:
            # Step 6: Final Lock
            print("Step 6: Enforcing NOT NULL...")
            cursor.execute("""
                ALTER TABLE voucher_purchase_supplier_details 
                MODIFY COLUMN vendor_basic_detail_id BIGINT NOT NULL;
            """)
            steps_results['step_6'] = "SUCCESS: NOT NULL enforced on vendor_basic_detail_id"
        else:
            steps_results['step_6'] = "SKIPPED: Not Null cannot be enforced due to orphans."
    except Exception as e:
        steps_results['step_6'] = f"ERROR: {str(e)}"

    print(json.dumps(steps_results, indent=2))

if __name__ == "__main__":
    apply_fixes()
