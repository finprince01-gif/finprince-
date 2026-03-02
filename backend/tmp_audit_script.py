from django.db import connection
import json

def run_audit():
    cursor = connection.cursor()
    tables = [
        'vendor_master_vendorcreation_basicdetail', 
        'vendor_master_vendorcreation_gstdetails', 
        'vendor_master_vendorcreation_productservices', 
        'vendor_master_vendorcreation_tds', 
        'vendor_master_vendorcreation_banking', 
        'vendor_master_vendorcreation_terms', 
        'voucher_purchase_supplier_details', 
        'voucher_purchase_due_details', 
        'voucher_purchase_supply_foreign_details', 
        'voucher_purchase_supply_inr_details', 
        'voucher_purchase_transit_details'
    ]
    
    audit_results = {}
    
    for table in tables:
        try:
            cursor.execute(f"SHOW CREATE TABLE {table}")
            create_sql = cursor.fetchone()[1]
            
            cursor.execute(f"DESCRIBE {table}")
            columns = cursor.fetchall()
            
            audit_results[table] = {
                'create_sql': create_sql,
                'columns': [
                    {
                        'Field': c[0],
                        'Type': c[1],
                        'Null': c[2],
                        'Key': c[3],
                        'Default': c[4],
                        'Extra': c[5]
                    } for c in columns
                ]
            }
        except Exception as e:
            audit_results[table] = {'error': str(e)}
            
    print(json.dumps(audit_results, indent=2))

if __name__ == "__main__":
    run_audit()
