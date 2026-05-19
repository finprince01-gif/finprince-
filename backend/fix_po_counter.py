"""
Script to check and fix the PO series counter.
Run with: python manage.py shell < fix_po_counter.py
"""
import django
from django.db import connection

# Check max PO number in DB
with connection.cursor() as c:
    c.execute("""
        SELECT 
            tenant_id,
            MAX(CAST(SUBSTRING(po_number, 3) AS UNSIGNED)) as max_num,
            COUNT(*) as total
        FROM vendor_transaction_po
        WHERE po_number LIKE 'PO%'
        GROUP BY tenant_id
    """)
    rows = c.fetchall()
    print("=== Max PO numbers by tenant ===")
    for row in rows:
        print(f"  tenant={row[0]}, max_num={row[1]}, total={row[2]}")

    # Check series counters
    c.execute("SELECT id, prefix, current_number, digits, suffix FROM vendor_master_posettings")
    series = c.fetchall()
    print("\n=== PO Series counters ===")
    for s in series:
        print(f"  id={s[0]}, prefix={s[1]}, current_number={s[2]}, digits={s[3]}")

    # Fix: update series counter to match max in DB
    print("\n=== Fixing counters ===")
    for s in series:
        sid, prefix, current_num, digits, *_ = s
        c.execute(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(po_number, %s) AS UNSIGNED)), 0) FROM vendor_transaction_po WHERE po_number LIKE %s",
            [len(prefix)+1, f"{prefix}%"]
        )
        max_in_db = c.fetchone()[0] or 0
        if max_in_db > current_num:
            c.execute(
                "UPDATE vendor_master_posettings SET current_number=%s WHERE id=%s",
                [max_in_db, sid]
            )
            print(f"  Updated series {sid}: {current_num} -> {max_in_db}")
        else:
            print(f"  Series {sid} already in sync (current={current_num}, db_max={max_in_db})")

print("\nDone!")
