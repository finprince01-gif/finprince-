import os
import sys
import csv
import django
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounting.models import MasterHierarchyRaw

def import_hierarchy_csv(csv_path):
    print(f"Starting import of {csv_path} into master_hierarchy_raw using Django ORM...")
    
    if not os.path.exists(csv_path):
        print(f"Error: File not found at {csv_path}")
        return

    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        
        print("Deleting existing records...")
        MasterHierarchyRaw.objects.all().delete()
        
        instances = []
        for row in reader:
            # Map CSV headers to Django Model fields
            # The CSV headers are: Type of Business, Financial Reporting, Major Group, Group, Sub-group 1, Sub-group 2, Sub-group 3, Ledgers, Code
            
            def clean(val):
                return None if not val or val.strip() == '' or val.strip() == '-' else val.strip()

            instance = MasterHierarchyRaw(
                type_of_business_1=clean(row.get('Type of Business')),
                financial_reporting_1=clean(row.get('Financial Reporting')),
                major_group_1=clean(row.get('Major Group')),
                group_1=clean(row.get('Group')),
                sub_group_1_1=clean(row.get('Sub-group 1')),
                sub_group_2_1=clean(row.get('Sub-group 2')),
                sub_group_3_1=clean(row.get('Sub-group 3')),
                ledger_1=clean(row.get('Ledgers')),
                code=clean(row.get('Code'))
            )
            instances.append(instance)
            
        print(f"Bulk creating {len(instances)} rows...")
        MasterHierarchyRaw.objects.bulk_create(instances, batch_size=1000)
            
    print("Import completed successfully!")

if __name__ == "__main__":
    csv_file_path = r"C:\Users\subik\Downloads\ledger_list_final_v7.csv"
    import_hierarchy_csv(csv_file_path)
