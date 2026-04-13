from django.db import connection

def run_backfill():
    queries = [
        # 1. Backfill customer_master_customer_basicdetails -> ledger
        """
        UPDATE customer_master_customer_basicdetails c
        JOIN master_ledgers l ON c.tenant_id = l.tenant_id AND c.customer_name = l.name
        SET c.ledger_id = l.id
        WHERE c.ledger_id IS NULL;
        """,
        # 2. Backfill vendor_master_vendorcreation_basicdetail -> ledger 
        """
        UPDATE vendor_master_vendorcreation_basicdetail v
        JOIN master_ledgers l ON v.tenant_id = l.tenant_id AND v.vendor_name = l.name
        SET v.ledger_id = l.id
        WHERE v.ledger_id IS NULL;
        """,
        # 3. Backfill vouchers -> ledger_id_val, party_customer_id, party_vendor_id
        """
        UPDATE vouchers v
        LEFT JOIN customer_master_customer_basicdetails c ON v.tenant_id = c.tenant_id AND v.party = c.customer_name
        LEFT JOIN vendor_master_vendorcreation_basicdetail ven ON v.tenant_id = ven.tenant_id AND v.party = ven.vendor_name
        SET 
            v.party_customer_id = c.id,
            v.party_vendor_id = ven.id,
            v.ledger_id_val = COALESCE(c.ledger_id, ven.ledger_id)
        WHERE v.party_customer_id IS NULL AND v.party_vendor_id IS NULL AND v.party IS NOT NULL;
        """
    ]
    
    with connection.cursor() as cursor:
        for idx, q in enumerate(queries):
            print(f"Running query {idx+1}...")
            cursor.execute(q)
            print(f"Rows affected: {cursor.rowcount}")
    print("Backfill completed.")

if __name__ == '__main__':
    import os
    import django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    django.setup()
    run_backfill()
