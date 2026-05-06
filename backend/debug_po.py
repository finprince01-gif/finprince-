from vendors.vendorpo_database import resolve_cancellation_status
from django.db import connection

with connection.cursor() as c:
    c.execute("SELECT id, po_number, status FROM vendor_transaction_po WHERE po_number IN ('PO00516','PO00515','PO00514') ORDER BY id DESC")
    rows = c.fetchall()
    for row in rows:
        po_id, po_number, current_status = row
        resolved = resolve_cancellation_status(po_id)
        print(f"ID={po_id} {po_number}: DB={current_status}, resolve()={resolved}")
        
        # Show what the GRN/Voucher lookup finds
        c.execute("SELECT COUNT(*) FROM inventory_operation_new_grn WHERE reference_no LIKE %s", [f'%{po_number}%'])
        grn = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM voucher_purchase_supply_inr_details WHERE purchase_order_no LIKE %s", [f'%{po_number}%'])
        vinr = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM voucher_purchase_supply_foreign_details WHERE purchase_order_no LIKE %s", [f'%{po_number}%'])
        vfgn = c.fetchone()[0]
        print(f"  -> GRN={grn}, VoucherINR={vinr}, VoucherForeign={vfgn}")
