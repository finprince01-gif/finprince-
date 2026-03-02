from django.db import connection, transaction
import json

def finalize_hardening():
    cursor = connection.cursor()
    
    results = {}
    
    # 1. Before cleanup count
    cursor.execute("SELECT count(*) FROM voucher_purchase_supplier_details WHERE vendor_basic_detail_id IS NULL")
    initial_orphans = cursor.fetchone()[0]
    results['initial_orphans'] = initial_orphans
    
    if initial_orphans == 0:
        results['status'] = "Already clean"
    else:
        # Tables that reference voucher_purchase_supplier_details
        child_tables = [
            'voucher_purchase_due_details',
            'voucher_purchase_supply_foreign_details',
            'voucher_purchase_supply_inr_details',
            'voucher_purchase_transit_details'
        ]
        
        # 2. Cleanup invalid tenant records
        print("Cleaning up records with empty tenant_id...")
        
        # IDs of parents to be deleted
        cursor.execute("SELECT id FROM voucher_purchase_supplier_details WHERE tenant_id = ''")
        ids_to_delete = [str(r[0]) for r in cursor.fetchall()]
        
        if ids_to_delete:
            id_list_str = "(" + ",".join(ids_to_delete) + ")"
            for child in child_tables:
                cursor.execute(f"DELETE FROM {child} WHERE supplier_details_id IN {id_list_str}")
            
            cursor.execute(f"DELETE FROM voucher_purchase_supplier_details WHERE id IN {id_list_str}")
            results['deleted_empty_tenant'] = cursor.rowcount
        else:
            results['deleted_empty_tenant'] = 0
            
        # 3. Cleanup garbage vendor records (orphans remaining)
        print("Cleaning up dummy vendor records...")
        cursor.execute("SELECT id FROM voucher_purchase_supplier_details WHERE vendor_basic_detail_id IS NULL")
        ids_to_delete = [str(r[0]) for r in cursor.fetchall()]
        
        if ids_to_delete:
            id_list_str = "(" + ",".join(ids_to_delete) + ")"
            for child in child_tables:
                cursor.execute(f"DELETE FROM {child} WHERE supplier_details_id IN {id_list_str}")
                
            cursor.execute(f"DELETE FROM voucher_purchase_supplier_details WHERE id IN {id_list_str}")
            results['deleted_dummy_vendors'] = cursor.rowcount
        else:
            results['deleted_dummy_vendors'] = 0
        
    # 4. Final count check
    cursor.execute("SELECT count(*) FROM voucher_purchase_supplier_details WHERE vendor_basic_detail_id IS NULL")
    final_orphans = cursor.fetchone()[0]
    results['final_orphans'] = final_orphans
    
    if final_orphans == 0:
        # 5. Enforce NOT NULL
        print("Enforcing NOT NULL constraint on vendor_basic_detail_id...")
        try:
            # MySQL syntax
            cursor.execute("ALTER TABLE voucher_purchase_supplier_details MODIFY COLUMN vendor_basic_detail_id BIGINT NOT NULL;")
            results['not_null_enforced'] = "SUCCESS"
        except Exception as e:
            results['not_null_enforced'] = f"ERROR: {str(e)}"
    else:
        results['not_null_enforced'] = "SKIPPED - Orphans still exist"

    # 6. Final Integrity Verification
    cursor.execute("""
        SELECT COUNT(*)
        FROM voucher_purchase_supplier_details p
        LEFT JOIN vendor_master_vendorcreation_basicdetail v 
        ON p.tenant_id = v.tenant_id AND p.vendor_basic_detail_id = v.id
        WHERE v.id IS NULL
    """)
    results['integrity_fail_count'] = cursor.fetchone()[0]

    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    finalize_hardening()
