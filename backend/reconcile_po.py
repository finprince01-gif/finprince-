from vendors.vendorpo_database import resolve_cancellation_status
from django.db import connection

with connection.cursor() as c:
    c.execute("SELECT id, po_number, status FROM vendor_transaction_po WHERE status='Executed Cancelled'")
    pos = c.fetchall()
    fixed = 0
    for po_id, po_number, current_status in pos:
        correct = resolve_cancellation_status(po_id)
        if correct != 'Executed Cancelled':
            c.execute("UPDATE vendor_transaction_po SET status=%s WHERE id=%s", [correct, po_id])
            print(f"Fixed {po_number}: Executed Cancelled -> {correct}")
            fixed += 1
        else:
            print(f"OK   {po_number}: correctly Executed Cancelled")
    print(f"\nDone. Fixed {fixed} POs.")
