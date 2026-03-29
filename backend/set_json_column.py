from django.db import connection
with connection.cursor() as cursor:
    try:
        cursor.execute("ALTER TABLE receipt_voucher_items DROP COLUMN pending_transaction")
    except:
        pass
    cursor.execute("ALTER TABLE receipt_voucher_items ADD COLUMN pending_transaction json DEFAULT NULL AFTER reference_type")
print("DONE_COL_JSON")
