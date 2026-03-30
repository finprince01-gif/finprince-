import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.db import connection

payroll_tables = [
    'payroll_employee_basic_details',
    'payroll_employee_employment',
    'payroll_employee_salary',
    'payroll_employee_statutory',
    'payroll_employee_bank_details',
    'payroll_employee',
    'payroll_salary_component',
    'payroll_salary_template',
    'payroll_salary_template_component',
    'payroll_pay_run',
    'payroll_pay_run_detail',
    'payroll_statutory_configuration',
    'payroll_attendance',
    'payroll_leave_application'
]

print("Checking payroll tables:")
with connection.cursor() as c:
    c.execute("SHOW TABLES")
    existing_tables = [row[0] for row in c.fetchall()]
    
    for table in payroll_tables:
        status = "EXISTS" if table in existing_tables else "MISSING"
        print(f"  {table:<40} : {status}")
