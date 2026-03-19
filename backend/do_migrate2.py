from django.db import connection

def run():
    with connection.cursor() as cursor:
        try:
            cursor.execute("ALTER TABLE inventory_master_inventoryitems ADD COLUMN cess_rate DECIMAL(5,2) NULL DEFAULT NULL")
            print('Added cess_rate column')
        except Exception as e:
            print(e)
