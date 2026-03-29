import os, sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import MasterLedger

ledgers = MasterLedger.objects.all()
sys.stdout.write(f"Total ledgers: {ledgers.count()}\n\n")
for l in ledgers:
    sys.stdout.write(f"name={repr(l.name)}, category={repr(l.category)}, group={repr(l.group)}, sub_group_1={repr(l.sub_group_1)}, sub_group_2={repr(l.sub_group_2)}, sub_group_3={repr(l.sub_group_3)}, ledger_type={repr(l.ledger_type)}\n")
sys.stdout.flush()
