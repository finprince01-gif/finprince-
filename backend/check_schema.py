from django.db import connection
with connection.cursor() as cursor:
    cursor.execute("DESCRIBE vendor_master_category")
    for row in cursor.fetchall():
        print(row)
