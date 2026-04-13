import os
import django
import sys

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection, transaction
from accounting.models import MasterLedger, MasterLedgerGroup

# Business 'huhuhuhu'
TENANT_ID = '3ddda738-b88d-4e98-84ec-94887dd81f79'

def restore():
    print(f"Starting hierarchy restoration for tenant: {TENANT_ID}")
    
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM master_hierarchy_mapped")
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    print(f"Loaded {len(rows)} rows from 'master_hierarchy_mapped' view.")

    group_cache = {} # (parent_id, name) -> id
    stats = {'groups': 0, 'ledgers': 0}

    with transaction.atomic():
        for row in rows:
            # Hierarchy levels for groups
            group_levels = [
                row['major_group'],
                row['group_name'],
                row['sub_group_1'],
                row['sub_group_2'],
                row['sub_group_3']
            ]
            
            curr_parent_id = None
            curr_parent_name = None
            last_group_name = None
            
            for level_val in group_levels:
                if not level_val or level_val == '-' or level_val.lower() == 'null':
                    continue
                
                level_val = level_val.strip()
                key = (curr_parent_id, level_val)
                
                if key not in group_cache:
                    grp, created = MasterLedgerGroup.objects.get_or_create(
                        name=level_val,
                        parent_id_id=curr_parent_id,
                        tenant_id=TENANT_ID,
                        defaults={'parent': curr_parent_name}
                    )
                    group_cache[key] = grp.id
                    if created: stats['groups'] += 1
                
                curr_parent_id = group_cache[key]
                curr_parent_name = level_val
                last_group_name = level_val

            # Handle the Ledger (Leaf node)
            ledger_name = row['ledger_name']
            if ledger_name and ledger_name != '-' and ledger_name.lower() != 'null':
                ledger_name = ledger_name.strip()
                
                # Check for duplicates by name + tenant
                ledger, created = MasterLedger.objects.get_or_create(
                    name=ledger_name,
                    tenant_id=TENANT_ID,
                    defaults={
                        'group_id_id': curr_parent_id,
                        'group': last_group_name or 'Unclassified',
                        'category': row['major_group'],
                        'major_group': row['major_group'],
                        'sub_group_1': row['group_name'],
                        'sub_group_2': row['sub_group_1'],
                        'sub_group_3': row['sub_group_2'],
                        'ledger_type': row['ledger_name'], 
                        'code': row['ledger_code'],
                        'type_of_business': row['type_of_business'],
                        'financial_reporting': row['financial_reporting']
                    }
                )
                if created: stats['ledgers'] += 1

    print(f"Restoration complete!")
    print(f"Summary: Created {stats['groups']} new groups, {stats['ledgers']} new ledgers.")
    print(f"Total Groups in cache: {len(group_cache)}")

if __name__ == "__main__":
    restore()
