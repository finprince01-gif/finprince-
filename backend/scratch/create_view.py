import os
import django
import sys

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

sql = """
CREATE OR REPLACE VIEW master_hierarchy_mapped AS
SELECT 
    NULLIF(TRIM(`Major Group`), '') AS major_group,
    NULLIF(TRIM(`Group`), '') AS group_name,
    NULLIF(TRIM(`Sub-group 1`), '') AS sub_group_1,
    NULLIF(TRIM(`Sub-group 2`), '') AS sub_group_2,
    NULLIF(TRIM(`Sub-group 3`), '') AS sub_group_3,
    NULLIF(TRIM(`Ledgers`), '') AS ledger_name,
    NULLIF(TRIM(`Code`), '') AS ledger_code,
    NULLIF(TRIM(`Type of Business`), '') AS type_of_business,
    NULLIF(TRIM(`Financial Reporting`), '') AS financial_reporting
FROM master_hierarchy_raw
WHERE TRIM(`Major Group`) IS NOT NULL AND TRIM(`Major Group`) != ''
  AND TRIM(`Ledgers`) IS NOT NULL AND TRIM(`Ledgers`) != '';
"""

with connection.cursor() as cursor:
    cursor.execute(sql)
    print("View created successfully.")
