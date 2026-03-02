"""
Diagnostic + backfill: check vendor 46 status and insert missing product services row.
"""
import os, django, json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def run():
    with connection.cursor() as cursor:

        # 1. Check if vendor 46 exists in basicdetail
        cursor.execute(
            "SELECT id, vendor_name, tenant_id FROM vendor_master_vendorcreation_basicdetail WHERE id = %s",
            [46]
        )
        row = cursor.fetchone()
        if not row:
            print("Vendor 46 does NOT exist in vendor_master_vendorcreation_basicdetail.")
            return
        vendor_id, vendor_name, tenant_id = row
        print(f"Vendor 46 found: '{vendor_name}' (tenant: {tenant_id})")

        # 2. Check if product services row exists for vendor 46
        cursor.execute(
            "SELECT id, items FROM vendor_master_vendorcreation_productservices WHERE vendor_basic_detail_id = %s",
            [46]
        )
        ps_row = cursor.fetchone()
        if ps_row:
            print(f"Product services row ALREADY EXISTS: id={ps_row[0]}, items={ps_row[1]}")
            return

        print("No product services row for vendor 46 — inserting now...")

        # 3. Backfill: insert empty items row for vendor 46
        cursor.execute("""
            INSERT INTO vendor_master_vendorcreation_productservices
                (tenant_id, vendor_basic_detail_id, items, is_active, created_at, updated_at, created_by, updated_by)
            VALUES
                (%s, %s, %s, 1, NOW(6), NOW(6), %s, %s)
        """, [tenant_id, 46, json.dumps([]), 'system', 'system'])

        new_id = cursor.lastrowid
        print(f"Inserted product services row with id={new_id} for vendor 46.")

        # 4. Also check all other vendors that are missing a product services row
        cursor.execute("""
            SELECT b.id, b.vendor_name
            FROM vendor_master_vendorcreation_basicdetail b
            LEFT JOIN vendor_master_vendorcreation_productservices p
                ON p.vendor_basic_detail_id = b.id
            WHERE p.id IS NULL
            ORDER BY b.id
        """)
        missing = cursor.fetchall()
        if missing:
            print(f"\n{len(missing)} other vendor(s) also missing a product services row:")
            for m in missing:
                print(f"  Vendor ID={m[0]}: {m[1]}")

            ans = input("\nBackfill ALL missing vendors with empty items []? (y/n): ").strip().lower()
            if ans == 'y':
                for m in missing:
                    cursor.execute("""
                        SELECT tenant_id FROM vendor_master_vendorcreation_basicdetail WHERE id = %s
                    """, [m[0]])
                    t = cursor.fetchone()[0]
                    cursor.execute("""
                        INSERT INTO vendor_master_vendorcreation_productservices
                            (tenant_id, vendor_basic_detail_id, items, is_active,
                             created_at, updated_at, created_by, updated_by)
                        VALUES (%s, %s, %s, 1, NOW(6), NOW(6), %s, %s)
                    """, [t, m[0], json.dumps([]), 'system', 'system'])
                    print(f"  Backfilled vendor {m[0]}: {m[1]}")
                print("Done backfilling all vendors.")
        else:
            print("\nAll other vendors already have a product services row.")

run()
