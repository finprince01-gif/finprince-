import os
import django
from django.db import connection, utils

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def fix_table():
    with connection.cursor() as cursor:
        print("Checking service_group table structure...")
        cursor.execute("DESCRIBE service_group")
        rows = cursor.fetchall()
        columns = {row[0]: {'type': row[1], 'null': row[2], 'default': row[4]} for row in rows}
        print(f"Current columns info: {columns.keys()}")

        # 1. Handle 'name' -> 'category' migration or addition
        if 'name' in columns and 'category' not in columns:
            print("Renaming 'name' to 'category'...")
            cursor.execute("ALTER TABLE service_group CHANGE COLUMN name category VARCHAR(100) NOT NULL")
        elif 'category' not in columns:
            print("Adding 'category' column...")
            cursor.execute("ALTER TABLE service_group ADD COLUMN category VARCHAR(100) NOT NULL AFTER tenant_id")

        # 2. Add 'group' column if missing
        if 'group' not in columns:
            print("Adding 'group' column...")
            cursor.execute("ALTER TABLE service_group ADD COLUMN `group` VARCHAR(100) NOT NULL DEFAULT '' AFTER category")

        # 3. Add 'subgroup' column if missing
        if 'subgroup' not in columns:
            print("Adding 'subgroup' column...")
            cursor.execute("ALTER TABLE service_group ADD COLUMN subgroup VARCHAR(100) NOT NULL DEFAULT '' AFTER `group`")

        # 4. Handle extra columns that cause errors (category_id, parent_group_id, etc.)
        # If they exist and are NOT NULL without a default, they will break Django's inserts
        model_columns = ['id', 'tenant_id', 'category', 'group', 'subgroup', 'is_active', 'created_at', 'updated_at']
        for col_name, info in columns.items():
            if col_name not in model_columns:
                print(f"Found extra column: {col_name} (Null={info['null']}, Default={info['default']})")
                if info['null'] == 'NO' and info['default'] is None:
                    print(f"Fixing extra column {col_name} by making it NULLABLE...")
                    cursor.execute(f"ALTER TABLE service_group MODIFY COLUMN `{col_name}` {info['type']} NULL")

        print("Table structure updated successfully.")

        # 5. Clean up any existing records
        cursor.execute("UPDATE service_group SET `group` = '' WHERE `group` IS NULL")
        cursor.execute("UPDATE service_group SET subgroup = '' WHERE subgroup IS NULL")
        print("Data cleanup completed.")

if __name__ == "__main__":
    try:
        fix_table()
    except Exception as e:
        print(f"Error fixing table: {e}")
