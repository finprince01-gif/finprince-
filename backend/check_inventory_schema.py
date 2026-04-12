import os
import django
import sys

# Setup Django environment
sys.path.append(os.path.abspath('d:/finpixe/Ai_Accounting-14/AI-accounting-0.03/backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.apps import apps
from django.db import connection

def check_all_inventory_models():
    inventory_app = apps.get_app_config('inventory')
    models = inventory_app.get_models()
    
    with connection.cursor() as cursor:
        for model in models:
            table = model._meta.db_table
            try:
                cursor.execute(f"DESCRIBE `{table}`")
                db_cols = {row[0] for row in cursor.fetchall()}
                model_cols = {f.column for f in model._meta.get_fields() if hasattr(f, 'column')}
                
                missing = model_cols - db_cols
                if missing:
                    print(f"Table `{table}` (Model: {model.__name__}) is missing columns: {missing}")
                else:
                    # print(f"Table `{table}` is synced.")
                    pass
            except Exception as e:
                print(f"Error checking table `{table}`: {e}")

if __name__ == "__main__":
    check_all_inventory_models()
