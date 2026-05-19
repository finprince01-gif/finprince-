import os
import sys
import django
from django.core.management import call_command
from django.db.utils import OperationalError, ProgrammingError

# Ensure the project root is in the python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def force_migrate():
    from django.db import connection
    
    # Get list of unapplied migrations
    from django.db.migrations.executor import MigrationExecutor
    executor = MigrationExecutor(connection)
    targets = executor.loader.graph.leaf_nodes()
    unapplied = executor.migration_plan(targets)
    
    for migration, backwards in unapplied:
        app = migration.app_label
        name = migration.name
        print(f"Applying {app}.{name}...")
        try:
            call_command('migrate', app, name)
            print(f"Successfully applied {app}.{name}")
        except Exception as e:
            error_str = str(e)
            if "already exists" in error_str.lower() or "Duplicate column name" in error_str:
                print(f"Table/Column already exists in {app}.{name}. Faking...")
                call_command('migrate', app, name, '--fake')
                print(f"Successfully faked {app}.{name}")
            else:
                print(f"Failed to apply {app}.{name}: {error_str}")
                # Try to fake it anyway if it's a structural issue we want to bypass
                # But be careful.
                # In this case, we probably want to continue.
                # print("Attempting to fake anyway...")
                # call_command('migrate', app, name, '--fake')

if __name__ == "__main__":
    force_migrate()
