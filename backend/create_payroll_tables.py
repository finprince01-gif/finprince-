import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.db import connection
from payroll.models import (
    Employee, SalaryComponent, SalaryTemplateComponent,
    PayRunDetail, StatutoryConfiguration, Attendance, LeaveApplication
)

models_to_create = [
    Employee, SalaryComponent, SalaryTemplateComponent,
    PayRunDetail, StatutoryConfiguration, Attendance, LeaveApplication
]

print("Creating missing payroll tables:")
with connection.schema_editor() as editor:
    for model in models_to_create:
        table_name = model._meta.db_table
        print(f"  Checking {table_name}...")
        try:
            # check if table exists
            with connection.cursor() as c:
                c.execute(f"SHOW TABLES LIKE '{table_name}'")
                exists = bool(c.fetchall())
            
            if not exists:
                print(f"    Creating {table_name}...")
                editor.create_model(model)
                print(f"    SUCCESS.")
            else:
                print(f"    ALREADY EXISTS.")
        except Exception as e:
            print(f"    ERROR: {e}")
