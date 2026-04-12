import os
import django
import sys
from django.conf import settings

# Setup Django environment
sys.path.append(os.path.abspath('d:/finpixe/Ai_Accounting-14/AI-accounting-0.03/backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from inventory.models import InventoryOperationNewGRN
from django.db import connection

def compare_model_and_db():
    model_opts = InventoryOperationNewGRN._meta
    model_fields = {f.column for f in model_opts.get_fields() if hasattr(f, 'column')}
    
    with connection.cursor() as cursor:
        cursor.execute("DESCRIBE inventory_operation_new_grn")
        db_columns = {row[0] for row in cursor.fetchall()}
    
    missing_in_db = model_fields - db_columns
    extra_in_db = db_columns - model_fields
    
    print(f"Model fields (columns): {model_fields}")
    print(f"DB columns: {db_columns}")
    print(f"Missing in DB: {missing_in_db}")
    print(f"Extra in DB: {extra_in_db}")

if __name__ == "__main__":
    compare_model_and_db()
