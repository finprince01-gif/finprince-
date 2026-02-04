import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from django.db import connection

output_file = "users_schema_alter_log.txt"

def log(msg):
    with open(output_file, "a") as f:
        f.write(str(msg) + "\n")
    print(msg)

if os.path.exists(output_file):
    os.remove(output_file)

log("Starting 'users' table alteration for tenant-scoped username...")

try:
    with connection.cursor() as cursor:
        # Check existing indexes on 'users'
        cursor.execute("SHOW INDEX FROM users;")
        indexes = cursor.fetchall()
        
        # Look for global unique index on username
        username_unique_index = None
        for idx in indexes:
            # format: Table, Non_unique, Key_name, Seq_in_index, Column_name, ...
            if idx[2] == 'username' and idx[4] == 'username' and idx[1] == 0:
                username_unique_index = idx[2]
                break
        
        if username_unique_index:
            log(f"Found existing global unique index on username: {username_unique_index}. Dropping it...")
            try:
                cursor.execute(f"ALTER TABLE users DROP INDEX {username_unique_index};")
                log("SUCCESS: Dropped global unique index on username.")
            except Exception as e:
                log(f"ERROR: Could not drop index {username_unique_index}: {e}")
        else:
            log("INFO: No global unique index named 'username' found (or already dropped).")

        # Now add the composite unique index (username, tenant_id)
        # Check if it already exists to avoid error
        composite_exists = False
        for idx in indexes:
             if idx[2] == 'unique_username_per_tenant': # Check by our chosen name
                 composite_exists = True
                 break
        
        if not composite_exists:
            log("Adding composite unique index (username, tenant_id)...")
            try:
                cursor.execute("ALTER TABLE users ADD UNIQUE INDEX unique_username_per_tenant (username, tenant_id);")
                log("SUCCESS: Added composite unique index.")
            except Exception as e:
                log(f"ERROR: Could not add composite index: {e}")
        else:
            log("INFO: Composite unique index 'unique_username_per_tenant' already exists.")

    log("Users schema alteration completed.")

except Exception as e:
    log(f"CRITICAL ERROR: {e}")
