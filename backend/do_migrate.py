from django.db import connection

def run():
    with connection.cursor() as cursor:
        try:
            cursor.execute("ALTER TABLE inventory_master_category ADD COLUMN sub_subgroup VARCHAR(255) NOT NULL DEFAULT '' AFTER subgroup")
            print('Added column')
        except Exception as e:
            print(e)
        cursor.execute("ALTER TABLE inventory_master_category DROP INDEX inventory_master_category_uniq")
        cursor.execute("CREATE UNIQUE INDEX inventory_master_category_uniq ON inventory_master_category (tenant_id, category(50), \group\(50), subgroup(50), sub_subgroup(50))")
        print('Updated index')
