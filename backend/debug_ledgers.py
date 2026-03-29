import os, sys, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from accounting.models import MasterLedgerGroup, MasterLedger
from django.db import connection

print("--- MasterLedgerGroup Hierarchy ---")
groups = MasterLedgerGroup.objects.all().order_by('parent', 'name')
for g in groups:
    print(f"ID: {g.id:3} | Name: {g.name:30} | Parent: {g.parent or 'NONE'}")

print("\n--- Liability Ledgers Check ---")
# Search for ledgers in groups that look like loans or borrowings
liability_keywords = ['loan', 'borrow', 'credit', 'liability']
for kw in liability_keywords:
    ledgers = MasterLedger.objects.filter(group__icontains=kw)
    if ledgers.exists():
        print(f"\nGroup Keyword: {kw}")
        for l in ledgers[:10]:
            print(f"  ID: {l.id:3} | Name: {l.name:30} | Group: {l.group}")

print("\n--- Specific Groups from Requirement ---")
target_groups = ['Short term borrowings', 'Secured loans', 'Unsecured loans']
for tg in target_groups:
    exists = MasterLedgerGroup.objects.filter(name__iexact=tg).exists()
    print(f"Group '{tg}': {'EXISTS' if exists else 'MISSING'}")
    if exists:
        children = MasterLedgerGroup.objects.filter(parent__iexact=tg)
        for c in children:
            print(f"  - Child: {c.name}")
